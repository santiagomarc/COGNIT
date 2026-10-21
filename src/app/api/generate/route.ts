import { randomUUID } from 'node:crypto';
import { after, NextResponse, type NextRequest } from 'next/server';
import { ensureSessionHeadroom, getRequestClient, getSessionUser } from '@/lib/supabase/session';
import { generateCardsSchema } from '@/lib/schemas';
import { recordAiUsage, reserveAiCall, touchDeckUpdatedAt, type ReservedCall } from '@/app/actions/_shared';
import { streamJson, type GenerateContentResponse } from '@/lib/gemini';
import {
  AiServiceError, aiFailureMessage, classifyAiError, withGeminiRetry, type AiFailureKind,
} from '@/lib/ai-retry';
import { addUsage, type AiUsageTotals } from '@/lib/ai-outcome';
import { createJsonArrayStream } from '@/lib/json-array-stream';
import {
  createCardPicker, normalizeFrontKey, parseGeneratedCard, sectionCap, sectionRequestSize, type CandidateCard,
} from '@/lib/card-generation';
import {
  GENERATION_SCHEMA, MAX_PDF_BYTES, PDF_CARD_GENERATION_MAX_COUNT,
  generationSystemPrompt, readPdfSections, sectionPrompt,
} from '@/lib/pdf-generation';
import type { TextChunk } from '@/lib/pdf-chunking';
import { runBackground } from '@/lib/background';
import { fillDerivedCardData } from '@/lib/card-derived';
import { sanitizeDatabaseError } from '@/lib/server-errors';
import { formatSseFrame } from '@/lib/sse-parsing';
import { logger } from '@/lib/logger';

/**
 * PDF → cards, streamed (performance plan AI-18).
 *
 * The old Server Action showed nothing until every section had answered and
 * the whole pool was ranked. This route streams the model's JSON and decides
 * per card (createCardPicker): a card is saved, then sent, the moment its
 * object closes, so the first one shows about one card's worth of output
 * after the call starts. Tags and quiz distractors come in the same call.
 *
 * Like /api/chat, this is outside src/proxy.ts's matcher: nothing buffers the
 * response, and the handler authenticates itself.
 *
 * Request: multipart — `file`, `deck_id`, `count` (1–30 or "max"), `offset`
 * (the first section to read; 0 unless continuing).
 *
 * Wire protocol:
 *   event: start    {"sections","offset"}
 *   event: card     {"id","front","back"}           saved before it is sent
 *   event: section  {"index","status"}              "done" | "failed" | "unfinished"
 *   event: more     {"nextOffset","remaining"}      time ran out; send the file again from nextOffset
 *   event: done     {"saved","failedSections","limited"?}
 *   event: error    {"message","retryable"}
 *
 * Sections run in waves of three, each wave under its own reservation, so a
 * cancel (the client aborts its fetch) stops at the wave it is in: no further
 * reservations, the streams in flight are abandoned, and every card already
 * sent stays saved.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Sections in flight at once; also the sections one reservation covers. */
const GENERATE_CONCURRENCY = 3;

/**
 * The function is killed at 60 s. Streams still open at 50 s are cut off and
 * the request ends with `more`, so the client continues from the first
 * unfinished section in a fresh request; the cut leaves the last saves and the
 * final frame inside the limit.
 */
const GENERATION_BUDGET_MS = 50_000;
/** No wave starts, and no retry waits, without this much time left. */
const MIN_CALL_WINDOW_MS = 8_000;
/** ~150 output tokens a card with tags and distractors (measured); 30 cards fit. */
const MAX_OUTPUT_TOKENS = 8_192;
/** The deck's existing terms read for de-duplication. */
const EXISTING_TERMS_LIMIT = 5_000;

const encoder = new TextEncoder();

type StopReason = 'full' | 'stop' | 'deadline';
type SectionStatus = 'done' | 'failed' | 'unfinished' | 'stopped';
type SectionResult = { status: SectionStatus; kind?: AiFailureKind; usage: AiUsageTotals | null };

export async function POST(request: NextRequest) {
  const deadline = Date.now() + GENERATION_BUDGET_MS;
  const remaining = () => deadline - Date.now();

  const [supabase, user] = await Promise.all([getRequestClient(), getSessionUser()]);
  if (!user) {
    return NextResponse.json({ error: 'You must be logged in.' }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Could not read the upload.' }, { status: 400 });
  }

  const countRaw = form.get('count');
  const parsed = generateCardsSchema.safeParse({
    deck_id: form.get('deck_id'),
    count: countRaw === 'max' ? PDF_CARD_GENERATION_MAX_COUNT : Number(countRaw ?? 10),
    offset: Number(form.get('offset') ?? 0),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request.' }, { status: 400 });
  }
  const { deck_id: deckId, count, offset } = parsed.data;

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'A PDF file is required.' }, { status: 400 });
  }
  if (file.size > MAX_PDF_BYTES) {
    return NextResponse.json({ error: 'PDF must be under 10 MB.' }, { status: 413 });
  }

  // Ownership, the deck's tags (new cards reuse them) and its terms (a second
  // upload adds only new ones), in one round trip.
  const [{ data: deck }, { data: tagRows }, { data: existingCards }] = await Promise.all([
    supabase.from('decks').select('id').eq('id', deckId).eq('user_id', user.id).maybeSingle(),
    supabase.rpc('get_deck_topic_tag_counts', { p_deck_id: deckId, p_limit: 30 }),
    supabase.from('cards').select('front').eq('deck_id', deckId)
      .order('created_at', { ascending: true }).limit(EXISTING_TERMS_LIMIT),
  ]);
  if (!deck) {
    return NextResponse.json({ error: 'Deck not found or access denied.' }, { status: 404 });
  }

  const pdf = await readPdfSections(file);
  if (!pdf.ok) {
    return NextResponse.json({ error: pdf.error }, { status: 422 });
  }
  const { chunks, sourceTextLower } = pdf;
  if (offset >= chunks.length) {
    return NextResponse.json({ error: 'There is nothing left to read in this PDF.' }, { status: 400 });
  }

  // Only once the upload has passed every check above: an unreadable PDF must
  // not cost a reservation.
  const reserveWave = (start: number, sections: number) => reserveAiCall(
    supabase,
    user.id,
    'generate_cards',
    { deck_id: deckId, chunk_count: chunks.length, offset: start, file_size_bytes: file.size },
    { calls: sections },
  );
  const firstReservation = await reserveWave(offset, Math.min(GENERATE_CONCURRENCY, chunks.length - offset));
  if (!firstReservation.ok) {
    const status = firstReservation.error === 'You must be logged in.' ? 401 : 429;
    return NextResponse.json({ error: firstReservation.error }, { status });
  }

  // The stream runs for up to a minute, writing as it goes, and the derived
  // data fill runs after it. A token refresh in that time could not reach the
  // browser's cookies once the response has started, so make room now.
  await ensureSessionHeadroom();

  const usedFrontKeys = new Set((existingCards ?? []).map((card) => normalizeFrontKey(card.front)).filter(Boolean));
  const knownTags = (tagRows ?? []).map((row) => row.topic_tag).filter(Boolean);
  const picker = createCardPicker({ count, usedFrontKeys });
  const nonce = randomUUID().slice(0, 8);
  const systemInstruction = generationSystemPrompt({ nonce, knownTags });

  // One controller for the run: the client leaving or cancelling, a failed
  // save, or a full request all stop every open section.
  const run = new AbortController();
  const onRequestAbort = () => run.abort('stop' satisfies StopReason);
  request.signal.addEventListener('abort', onRequestAbort, { once: true });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (request.signal.aborted) return;
        try {
          controller.enqueue(encoder.encode(formatSseFrame(event, data)));
        } catch {
          // The reader is gone; the request's abort stops the run.
        }
      };

      // ── Saving: one insert per card, in order, before the card is sent ──
      let saved = 0;
      let saveError: string | null = null;
      let saves = Promise.resolve();
      const save = (card: CandidateCard) => {
        saves = saves.then(async () => {
          if (saveError) return;
          const { data, error } = await supabase
            .from('cards')
            .insert({
              deck_id: deckId,
              front: card.front.slice(0, 1000),
              back: card.back.slice(0, 2000),
              source: 'ai_pdf' as const,
              topic_tags: card.topicTags.length > 0 ? card.topicTags : null,
              mcq_distractors: card.distractors.length === 3 ? card.distractors : null,
            })
            .select('id')
            .single();
          if (error || !data) {
            logger.error('api/generate', 'insert error', { code: error?.code, message: error?.message });
            saveError = sanitizeDatabaseError(error, 'Cards were generated but failed to save.');
            run.abort('stop' satisfies StopReason);
            return;
          }
          saved += 1;
          send('card', { id: data.id, front: card.front, back: card.back });
        });
      };

      // ── One section: stream, check each card as it closes, take or hold it ──
      // When the current wave's first card was taken (an object, so the
      // sections can set it from their own closures).
      const wave = { firstCardAt: null as number | null };
      const runSection = async (chunk: TextChunk, cap: number, knownTerms: string[]): Promise<SectionResult> => {
        picker.open(chunk.index, cap);
        const section = new AbortController();
        const stop = (reason: StopReason) => {
          if (!section.signal.aborted) section.abort(reason);
        };
        const onRunAbort = () => stop(run.signal.reason as StopReason);
        run.signal.addEventListener('abort', onRunAbort, { once: true });
        const timer = setTimeout(() => stop('deadline'), Math.max(0, remaining()));

        let lastUsage: Pick<GenerateContentResponse, 'usageMetadata'> | null = null;
        let parsedObjects = 0;
        let taken = 0;
        const usage = () => (lastUsage ? addUsage(null, lastUsage) : null);
        const settle = (reason: StopReason): SectionResult => {
          if (reason === 'full') return { status: 'done', usage: usage() };
          if (reason === 'deadline') return { status: 'unfinished', usage: usage() };
          return { status: 'stopped', usage: usage() };
        };
        try {
          const response = await withGeminiRetry(
            () => streamJson({
              systemInstruction,
              responseSchema: GENERATION_SCHEMA,
              maxOutputTokens: MAX_OUTPUT_TOKENS,
              contents: [{
                role: 'user',
                parts: [{
                  text: sectionPrompt({
                    chunk,
                    sectionCount: chunks.length,
                    requestSize: sectionRequestSize(cap, PDF_CARD_GENERATION_MAX_COUNT),
                    knownTerms,
                    nonce,
                  }),
                }],
              }],
              signal: section.signal,
            }),
            {
              label: `generate_cards_chunk_${chunk.index}`,
              maxAttempts: 2,
              signal: section.signal,
              // Retry, or wait out a free-tier 429, only while a call still fits.
              shouldRetry: () => remaining() > MIN_CALL_WINDOW_MS,
              maxServerDelayMs: Math.max(0, remaining() - MIN_CALL_WINDOW_MS),
            },
          );

          const objects = createJsonArrayStream();
          for await (const piece of response) {
            if (piece.usageMetadata) lastUsage = piece;
            for (const item of objects.push(piece.text ?? '')) {
              parsedObjects += 1;
              const candidate = parseGeneratedCard(item, sourceTextLower);
              if (!candidate || picker.offer(chunk.index, candidate) !== 'take') continue;
              taken += 1;
              wave.firstCardAt ??= Date.now();
              save(candidate);
              if (picker.full()) run.abort('full' satisfies StopReason);
              else if (picker.sectionFull(chunk.index)) stop('full');
            }
            if (section.signal.aborted) break;
          }

          if (section.signal.aborted) return settle(section.signal.reason as StopReason);
          if (parsedObjects === 0) {
            throw new AiServiceError('malformed_output', 'Model returned no cards.', 1);
          }
          return { status: 'done', usage: usage() };
        } catch (error) {
          if (section.signal.aborted) return settle(section.signal.reason as StopReason);
          const kind = error instanceof AiServiceError ? error.kind : classifyAiError(error);
          logger.warn('api/generate', 'section failed', {
            chunkIndex: chunk.index,
            kind,
            taken,
            error: error instanceof Error ? error.message : String(error),
          });
          // A section that already gave cards was read, if not to the end.
          return { status: taken > 0 ? 'done' : 'failed', kind, usage: usage() };
        } finally {
          clearTimeout(timer);
          run.signal.removeEventListener('abort', onRunAbort);
        }
      };

      // ── Waves ──
      let failedSections = 0;
      let firstFailureKind: AiFailureKind | null = null;
      let nextOffset: number | null = null;
      let limited: string | null = null;

      try {
        send('start', { sections: chunks.length, offset });

        for (let start = offset; start < chunks.length; start += GENERATE_CONCURRENCY) {
          if (picker.full() || run.signal.aborted) break;
          if (remaining() < MIN_CALL_WINDOW_MS) {
            nextOffset = start;
            break;
          }

          const sections = chunks.slice(start, start + GENERATE_CONCURRENCY);
          let reservation: ReservedCall;
          if (start === offset) {
            reservation = firstReservation;
          } else {
            const next = await reserveWave(start, sections.length);
            if (!next.ok) {
              // The sections read so far stay saved; say why the rest weren't.
              limited = next.error;
              break;
            }
            reservation = next;
          }

          const cap = sectionCap(count, picker.accepted(), chunks.length - start);
          const knownTerms = [...usedFrontKeys].slice(-40);
          const takenBefore = picker.accepted();
          wave.firstCardAt = null;

          const results = await Promise.all(sections.map(async (chunk) => {
            const result = await runSection(chunk, cap, knownTerms);
            if (result.status !== 'stopped') send('section', { index: chunk.index, status: result.status });
            return result;
          }));

          let waveUsage: AiUsageTotals | null = null;
          for (const [index, result] of results.entries()) {
            if (result.usage) {
              waveUsage = {
                input: (waveUsage?.input ?? 0) + result.usage.input,
                output: (waveUsage?.output ?? 0) + result.usage.output,
                thoughts: (waveUsage?.thoughts ?? 0) + result.usage.thoughts,
              };
            }
            if (result.status === 'failed') {
              failedSections += 1;
              firstFailureKind ??= result.kind ?? 'unknown';
            }
            if (result.status === 'unfinished') nextOffset ??= sections[index].index;
          }

          await recordAiUsage(
            supabase,
            user.id,
            'generate_cards',
            {
              deck_id: deckId,
              offset: start,
              sections: sections.length,
              chunk_count: chunks.length,
              taken: picker.accepted() - takenBefore,
              failed_chunks: results.filter((result) => result.status === 'failed').length,
            },
            reservation,
            // Time to the wave's first card: what the user waits for (G5).
            { usage: waveUsage, ttftMs: wave.firstCardAt !== null ? wave.firstCardAt - reservation.startedAt : null },
          );

          if (nextOffset !== null) break;
        }

        // Every section has answered (or the limit stopped them): the best
        // held cards fill whatever room is left. Not after a cancel, and not
        // when a later request will read more of the document.
        if (nextOffset === null && run.signal.reason !== 'stop') {
          for (const card of picker.fill()) save(card);
        }
        await saves;

        if (saved > 0) {
          await touchDeckUpdatedAt(supabase, deckId, user.id);
          // Embeddings for the new cards, and tags or distractors for any the
          // model left without, after the response (AI-13). The deck page's
          // backfill finishes whatever this doesn't.
          after(() => runBackground(
            'pdf_fill',
            () => fillDerivedCardData(supabase, user.id, deckId, { trigger: 'pdf_generate' }),
            { deckId },
          ));
        }

        if (saveError) {
          send('error', { message: saveError, retryable: false });
        } else if (nextOffset !== null && !picker.full()) {
          send('more', { nextOffset, remaining: count - picker.accepted() });
        } else if (saved === 0 && !request.signal.aborted) {
          send('error', noCardsError(failedSections, firstFailureKind, limited));
        } else {
          send('done', { saved, failedSections, ...(limited ? { limited } : {}) });
        }
      } catch (error) {
        logger.error('api/generate', 'generation failed', { error: error instanceof Error ? error.message : String(error) });
        await saves;
        send('error', { message: 'Card generation failed. Please try again shortly.', retryable: true });
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
      run.abort('stop' satisfies StopReason);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

/** Why nothing was saved, in words the user can act on. */
function noCardsError(failedSections: number, kind: AiFailureKind | null, limited: string | null) {
  if (limited) return { message: limited, retryable: false };
  if (failedSections > 0 && kind && kind !== 'unknown') {
    return {
      message: aiFailureMessage(kind, 'Card generation'),
      retryable: kind === 'rate_limited' || kind === 'unavailable' || kind === 'timeout',
    };
  }
  return {
    message: failedSections > 0
      ? 'AI could not generate cards from this PDF — every section failed to process. Please try again, or use Bulk Import.'
      : 'AI could not generate new cards from this PDF: none passed the checks, or the deck already has them. Try a different section, or use Bulk Import.',
    retryable: failedSections > 0,
  };
}
