import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { chatWithDeckSchema } from '@/lib/schemas';
import { removeDeckTagFromTitle } from '@/lib/deck-tags';
import { createDeckChatSession } from '@/app/actions/chat';
import {
  getGeminiJsonModel,
  getGeminiTextModel,
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
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
  // budget — the whole point of finding S-2.
  const reservation = await reserveAiCall(supabase, user.id, 'chat_with_deck');
  if (!reservation.ok) {
    return NextResponse.json({ error: reservation.error }, { status: 429 });
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

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let answer = '';

      try {
        // ── 1. Retrieve (threshold-aware) ──
        const context = await retrieveDeckContext(supabase, {
          deckId: parsed.data.deck_id,
          query: message,
          topK: parsed.data.top_k ?? 5,
        });

        if (context.degraded) {
          controller.enqueue(sse('error', {
            message: 'Deck search is unavailable right now, so I can\'t answer from your cards.',
            retryable: true,
          }));
          return;
        }

        // Emitted before the first token so source chips render while the
        // model is still thinking — retrieval is the slow part.
        controller.enqueue(sse('meta', {
          sessionId: activeSessionId,
          grounded: context.grounded,
          degraded: context.degraded,
          references: context.cards.map((card) => ({
            id: card.id,
            front: card.front,
            similarity: card.similarity,
          })),
        }));

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
          () => textModel.generateContentStream({
            systemInstruction: buildDeckChatSystemInstruction({
              deckTitle,
              contextText,
              grounded: context.grounded,
            }),
            contents: [
              ...history.map((entry) => ({
                role: entry.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: entry.content }],
              })),
              { role: 'user', parts: [{ text: message }] },
            ],
          }),
          { label: 'deck_chat_stream', maxAttempts: 2 },
        );

        for await (const chunk of result.stream) {
          const text = chunk.text();
          if (!text) continue;
          answer += text;
          controller.enqueue(sse('delta', { text }));
        }

        if (!answer.trim()) {
          throw new AiServiceError('malformed_output', 'Model returned an empty stream.', 1);
        }

        // ── 4. Persist, then follow-ups (best effort) ──
        const messageId = await persistTurn(supabase, {
          sessionId: activeSessionId,
          deckId: parsed.data.deck_id,
          userId: user.id,
          userMessage: message,
          answer,
          referencedCardIds: context.cards.map((card) => card.id),
        });

        const followupSuggestions = await generateFollowups(message, answer).catch(() => []);
        controller.enqueue(sse('done', { followupSuggestions, messageId }));

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
        const kind = error instanceof AiServiceError ? error.kind : classifyAiError(error);
        logger.error('api/chat', 'stream failed', {
          error: error instanceof Error ? error.message : String(error),
        });

        controller.enqueue(sse('error', {
          message: aiFailureMessage(kind, 'Deck chat'),
          retryable: kind === 'rate_limited' || kind === 'unavailable' || kind === 'timeout',
          // A partial answer is still useful — let the client keep what streamed.
          partial: answer || undefined,
        }));
      } finally {
        controller.close();
      }
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
      followup_suggestions: [],
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
async function generateFollowups(question: string, answer: string): Promise<string[]> {
  const model = getGeminiJsonModel({ temperature: 0.4 });

  const response = await withGeminiRetry(
    () => model.generateContent({
      systemInstruction: [
        'Given a study question and its answer, propose up to 3 short follow-up questions the learner could ask next.',
        'Under 12 words each. Return JSON: {"suggestions":[...]}',
      ].join('\n'),
      generationConfig: {
        responseMimeType: 'application/json',
        maxOutputTokens: 256,
      },
      contents: [{ role: 'user', parts: [{ text: `Q: ${question}\nA: ${answer}` }] }],
    }),
    { label: 'deck_chat_followups', maxAttempts: 1 },
  );

  const parsed = JSON.parse(response.response.text()) as { suggestions?: unknown };
  return Array.isArray(parsed.suggestions)
    ? parsed.suggestions.filter((s): s is string => typeof s === 'string').slice(0, 3)
    : [];
}
