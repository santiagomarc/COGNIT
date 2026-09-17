import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { chatWithDeckSchema } from '@/lib/schemas';
import { removeDeckTagFromTitle } from '@/lib/deck-tags';
import { createDeckChatSession } from '@/app/actions/chat';
import {
  getGeminiJsonModel,
  getGeminiTextModel,
  jsonGenerationConfig,
  recordAiUsage,
  reserveAiCall,
  sanitizeAiInputText,
} from '@/app/actions/_shared';
import { buildDeckChatSystemInstruction, retrieveDeckContext } from '@/lib/rag';
import { AiServiceError, aiFailureMessage, classifyAiError, withGeminiRetry } from '@/lib/ai-retry';
import { logger } from '@/lib/logger';

/**
 * Streaming deck chat over Server-Sent Events.
 *
 * IMPORTANT — src/proxy.ts excludes /api/** from its matcher. Two consequences:
 *  1. Nothing buffers this response, which is what makes SSE work at all.
 *  2. No Supabase session refresh runs here, so this handler authenticates
 *     itself below. A token that expires mid-conversation yields a 401; the
 *     client surfaces it, and any page navigation (which DOES pass through the
 *     proxy) refreshes the session.
 *
 * Wire protocol:
 *   event: meta   {"sessionId","references":[…],"grounded","degraded"}
 *   event: delta  {"text":"…"}
 *   event: done   {"followupSuggestions":[…],"messageId"}
 *   event: error  {"message","retryable","partial"?}
 *
 * Cancellation: the client aborts its fetch on navigation or a newer send
 * (use-deck-chat-stream.ts). That abort is observed here through
 * `request.signal` and the stream's `cancel()` hook: the model stream is
 * abandoned, whatever was delivered is persisted as a truncated turn, and the
 * follow-up call is skipped. Before this, a cancelled turn still consumed the
 * full stream, persisted an answer nobody saw and paid for follow-ups.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const encoder = new TextEncoder();

function sse(event: string, data: unknown) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'You must be logged in.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const parsed = chatWithDeckSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const { data: deck } = await supabase
    .from('decks')
    .select('id, title')
    .eq('id', parsed.data.deck_id)
    .eq('user_id', user.id)
    .single();

  if (!deck) {
    return NextResponse.json({ error: 'Deck not found or access denied.' }, { status: 404 });
  }

  // Reserve BEFORE the model call so a failed stream still counts against the
  // budget — the whole point of finding S-2. A turn is two model calls: the
  // answer and its follow-ups.
  const reservation = await reserveAiCall(
    supabase,
    user.id,
    'chat_with_deck',
    { deck_id: parsed.data.deck_id },
    { calls: 2 },
  );
  if (!reservation.ok) {
    const status = reservation.error === 'You must be logged in.' ? 401 : 429;
    return NextResponse.json({ error: reservation.error }, { status });
  }

  const message = sanitizeAiInputText(parsed.data.message, 2_000);
  if (!message) {
    return NextResponse.json({ error: 'Message is empty after sanitization.' }, { status: 400 });
  }

  let sessionId = parsed.data.session_id ?? null;
  if (!sessionId) {
    const created = await createDeckChatSession({
      deck_id: parsed.data.deck_id,
      title: message.slice(0, 80),
    });

    if (!('success' in created) || !created.success) {
      const errorText = 'error' in created && typeof created.error === 'string'
        ? created.error
        : 'Failed to start chat.';
      return NextResponse.json({ error: errorText }, { status: 500 });
    }

    sessionId = created.session.id;
  }

  const activeSessionId = sessionId;
  const deckTitle = removeDeckTagFromTitle(deck.title ?? '').trim() || 'Untitled Deck';

  // One controller for the whole turn: the request's own abort (client went
  // away) and the stream's cancel() (consumer stopped reading) both land here.
  const abort = new AbortController();
  const onRequestAbort = () => abort.abort();
  request.signal.addEventListener('abort', onRequestAbort, { once: true });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let answer = '';
      // enqueue() throws once the consumer has cancelled; the turn is over
      // either way, so the throw must not be mistaken for a model failure.
      const send = (event: string, data: unknown) => {
        if (abort.signal.aborted) return;
        try {
          controller.enqueue(sse(event, data));
        } catch {
          abort.abort();
        }
      };

      try {
        // ── 1. Retrieve (threshold-aware) ──
        const context = await retrieveDeckContext(supabase, {
          deckId: parsed.data.deck_id,
          query: message,
          topK: parsed.data.top_k ?? 5,
        });

        if (context.degraded) {
          send('error', {
            message: 'Deck search is unavailable right now, so I can\'t answer from your cards.',
            retryable: true,
          });
          return;
        }
        if (abort.signal.aborted) return;

        // Emitted before the first token so source chips render while the
        // model is still thinking — retrieval is the slow part.
        send('meta', {
          sessionId: activeSessionId,
          grounded: context.grounded,
          degraded: context.degraded,
          references: context.cards.map((card) => ({
            id: card.id,
            front: card.front,
            similarity: card.similarity,
          })),
        });

        // ── 2. Recent turns for continuity ──
        const { data: historyRows } = await supabase
          .from('deck_chat_messages')
          .select('role, content')
          .eq('session_id', activeSessionId)
          .eq('deck_id', parsed.data.deck_id)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(6);

        const history = (historyRows ?? []).reverse();
        const contextText = context.cards
          .map((card, index) => `${index + 1}. ${card.front}: ${card.back}`)
          .join('\n');

        // ── 3. Stream the answer ──
        const textModel = getGeminiTextModel({ temperature: 0.4 });
        const result = await withGeminiRetry(
          () => textModel.generateContentStream(
            {
              systemInstruction: buildDeckChatSystemInstruction({
                deckTitle,
                contextText,
                grounded: context.grounded,
                nonce: randomUUID().slice(0, 8),
              }),
              contents: [
                ...history.map((entry) => ({
                  role: entry.role === 'assistant' ? 'model' : 'user',
                  parts: [{ text: entry.content }],
                })),
                { role: 'user', parts: [{ text: message }] },
              ],
            },
            { signal: abort.signal },
          ),
          { label: 'deck_chat_stream', maxAttempts: 2, signal: abort.signal },
        );

        for await (const chunk of result.stream) {
          if (abort.signal.aborted) break;
          const text = chunk.text();
          if (!text) continue;
          answer += text;
          send('delta', { text });
        }

        if (abort.signal.aborted) {
          // The user left. Keep what they saw so the session reads back
          // honestly; no follow-ups — nobody is there to read them.
          if (answer.trim()) {
            await persistTurn(supabase, {
              sessionId: activeSessionId,
              deckId: parsed.data.deck_id,
              userId: user.id,
              userMessage: message,
              answer,
              referencedCardIds: context.cards.map((card) => card.id),
              followupSuggestions: [],
            });
          }
          logger.info('api/chat', 'stream cancelled by client', { answer_chars: answer.length });
          return;
        }

        if (!answer.trim()) {
          throw new AiServiceError('malformed_output', 'Model returned an empty stream.', 1);
        }

        // ── 4. Follow-ups (best effort), then persist the whole turn ──
        // Follow-ups go into the assistant row: a reopened session used to lose
        // every chip because persistTurn wrote an empty array before they existed.
        const followupSuggestions = abort.signal.aborted
          ? []
          : await generateFollowups(message, answer, abort.signal).catch(() => []);

        const messageId = await persistTurn(supabase, {
          sessionId: activeSessionId,
          deckId: parsed.data.deck_id,
          userId: user.id,
          userMessage: message,
          answer,
          referencedCardIds: context.cards.map((card) => card.id),
          followupSuggestions,
        });

        send('done', { followupSuggestions, messageId });

        await recordAiUsage(
          supabase,
          user.id,
          'chat_with_deck',
          {
            deck_id: parsed.data.deck_id,
            session_id: activeSessionId,
            context_count: context.cards.length,
            grounded: context.grounded,
            prompt_chars: message.length,
            response_chars: answer.length,
          },
          reservation.reservationId,
        );
      } catch (error) {
        if (abort.signal.aborted) {
          // An abort surfaces as a rejected fetch inside the SDK; it is not a failure.
          logger.info('api/chat', 'stream cancelled by client', { answer_chars: answer.length });
          return;
        }

        const kind = error instanceof AiServiceError ? error.kind : classifyAiError(error);
        logger.error('api/chat', 'stream failed', {
          error: error instanceof Error ? error.message : String(error),
        });

        send('error', {
          message: aiFailureMessage(kind, 'Deck chat'),
          retryable: kind === 'rate_limited' || kind === 'unavailable' || kind === 'timeout',
          // A partial answer is still useful — let the client keep what streamed.
          partial: answer || undefined,
        });
      } finally {
        request.signal.removeEventListener('abort', onRequestAbort);
        try {
          controller.close();
        } catch {
          // Already closed by a cancel().
        }
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Defeats nginx/proxy response buffering in self-hosted deployments.
      'X-Accel-Buffering': 'no',
    },
  });
}

type PersistTurnInput = {
  sessionId: string;
  deckId: string;
  userId: string;
  userMessage: string;
  answer: string;
  referencedCardIds: string[];
  followupSuggestions: string[];
};

async function persistTurn(
  supabase: SupabaseServerClient,
  input: PersistTurnInput,
): Promise<string | null> {
  const { error: userInsertError } = await supabase.from('deck_chat_messages').insert({
    session_id: input.sessionId,
    deck_id: input.deckId,
    user_id: input.userId,
    role: 'user',
    content: input.userMessage,
    referenced_card_ids: [],
    followup_suggestions: [],
  });

  if (userInsertError) {
    logger.warn('api/chat', 'failed to persist user message', { message: userInsertError.message });
  }

  const { data, error } = await supabase
    .from('deck_chat_messages')
    .insert({
      session_id: input.sessionId,
      deck_id: input.deckId,
      user_id: input.userId,
      role: 'assistant',
      content: input.answer,
      referenced_card_ids: input.referencedCardIds,
      followup_suggestions: input.followupSuggestions,
    })
    .select('id')
    .single();

  if (error) {
    logger.warn('api/chat', 'failed to persist assistant message', { message: error.message });
  }

  await supabase
    .from('deck_chat_sessions')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', input.sessionId)
    .eq('user_id', input.userId);

  return data?.id ?? null;
}

/** Cheap second call. Failure is non-fatal — the answer has already streamed. */
async function generateFollowups(question: string, answer: string, signal: AbortSignal): Promise<string[]> {
  const model = getGeminiJsonModel({ temperature: 0.4 });

  const response = await withGeminiRetry(
    () => model.generateContent(
      {
        systemInstruction: [
          'Given a study question and its answer, propose up to 3 short follow-up questions the learner could ask next.',
          'Under 12 words each. Return JSON: {"suggestions":[...]}',
        ].join('\n'),
        generationConfig: jsonGenerationConfig({ temperature: 0.4, maxOutputTokens: 256 }),
        contents: [{ role: 'user', parts: [{ text: `Q: ${question}\nA: ${answer}` }] }],
      },
      { signal },
    ),
    { label: 'deck_chat_followups', maxAttempts: 1, signal },
  );

  const parsed = JSON.parse(response.response.text()) as { suggestions?: unknown };
  return Array.isArray(parsed.suggestions)
    ? parsed.suggestions.filter((s): s is string => typeof s === 'string').slice(0, 3)
    : [];
}
