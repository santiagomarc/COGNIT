import type { createClient } from '@/lib/supabase/server';
import { getRequestClient, getSessionUser } from '@/lib/supabase/session';
import { GoogleGenerativeAI, type GenerationConfig, type Schema } from '@google/generative-ai';
import type { Json } from '@/lib/database.types';
import { logger } from '@/lib/logger';
import { getServerEnv } from '@/lib/env-server';

export type AiActionName =
  | 'generate_cards'
  | 'enrich_cards'
  | 'sanitize_notes'
  | 'get_hint'
  | 'generate_mnemonic'
  | 'chat_with_deck'
  | 'sync_embeddings'
  | 'semantic_search'
  | 'synthesis_generate'
  | 'synthesis_check';

const AI_RATE_LIMITS: Record<AiActionName, { windowMinutes: number; maxRequests: number }> = {
  generate_cards: { windowMinutes: 60, maxRequests: 20 },
  enrich_cards: { windowMinutes: 60, maxRequests: 120 },
  sanitize_notes: { windowMinutes: 60, maxRequests: 30 },
  get_hint: { windowMinutes: 60, maxRequests: 90 },
  generate_mnemonic: { windowMinutes: 60, maxRequests: 60 },
  chat_with_deck: { windowMinutes: 60, maxRequests: 40 },
  // Each call now embeds at most 200 cards (see CARDS_PER_SYNC_BATCH in chat.ts),
  // so a large deck needs several calls per sync — this limit must accommodate that.
  sync_embeddings: { windowMinutes: 60, maxRequests: 40 },
  semantic_search: { windowMinutes: 60, maxRequests: 60 },
  // One reservation generates up to 5 drills (≈ $0.007); one check is a single
  // ≈ 1.2k-token call (≈ $0.001) — spec §6.4 / §7.6.
  synthesis_generate: { windowMinutes: 60, maxRequests: 12 },
  synthesis_check: { windowMinutes: 60, maxRequests: 40 },
};

function getGeminiClient() {
  // getServerEnv throws with a precise message when GEMINI_API_KEY is absent or
  // malformed, so every AI entry point fails the same way instead of each
  // inventing its own check.
  return new GoogleGenerativeAI(getServerEnv().GEMINI_API_KEY);
}

/**
 * @param options.temperature Defaults to 0.1. Extraction and enrichment want
 * near-determinism — the same PDF should yield the same cards. Callers that
 * want warmth (deck chat) pass their own value.
 */
export function getGeminiJsonModel(options?: { temperature?: number }) {
  const env = getServerEnv();
  const genai = getGeminiClient();
  return genai.getGenerativeModel({
    model: env.GEMINI_MODEL,
    generationConfig: {
      temperature: options?.temperature ?? 0.1,
      topP: 0.95,
      responseMimeType: 'application/json',
      maxOutputTokens: env.GEMINI_MODEL_MAX_TOKENS,
    },
  });
}

export function getGeminiTextModel(options?: { temperature?: number }) {
  const env = getServerEnv();
  const genai = getGeminiClient();
  return genai.getGenerativeModel({
    model: env.GEMINI_MODEL,
    generationConfig: {
      temperature: options?.temperature ?? 0.5,
      maxOutputTokens: env.GEMINI_MODEL_MAX_TOKENS,
    },
  });
}

export function getGeminiEmbeddingModel() {
  const genai = getGeminiClient();
  return genai.getGenerativeModel({
    model: getServerEnv().GEMINI_EMBEDDING_MODEL,
  });
}

/**
 * The per-request config for a structured (JSON) call.
 *
 * A request-level `generationConfig` REPLACES the model-level one in
 * @google/generative-ai 0.24 (`GenerativeModel.generateContent` spreads the
 * request over `{ generationConfig: this.generationConfig, … }`), so a call
 * that only passes `responseSchema` silently drops the factory's temperature
 * and output cap and runs at the model default. Every JSON call site builds
 * its config here so that cannot happen again.
 *
 * `thinkingBudget: 0` is the default on purpose: extraction, enrichment and
 * classification gain nothing from thinking tokens, which are billed and drawn
 * from the same output budget. Callers that measure a quality gain pass their
 * own budget. The field is not in 0.24's types; like `propertyOrdering` it is
 * forwarded to the REST body unchanged.
 */
export function jsonGenerationConfig(input: {
  responseSchema?: Schema;
  temperature?: number;
  maxOutputTokens?: number;
  thinkingBudget?: number;
} = {}): GenerationConfig {
  const env = getServerEnv();
  return {
    temperature: input.temperature ?? 0.1,
    topP: 0.95,
    maxOutputTokens: input.maxOutputTokens ?? env.GEMINI_MODEL_MAX_TOKENS,
    responseMimeType: 'application/json',
    ...(input.responseSchema ? { responseSchema: input.responseSchema } : {}),
    ...({ thinkingConfig: { thinkingBudget: input.thinkingBudget ?? 0 } } as object),
  };
}

export function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export { normalizeForMatch, normalizeWhitespace } from '@/lib/text-normalize';

// Deliberately does not strip fenced code blocks: this app is used to study
// programming material, and the system instructions on every AI call already
// mark card/PDF text as untrusted data that must not be followed as instructions.
const AI_INJECTION_PATTERNS = [
  /\b(?:ignore|disregard|forget|override|bypass)\b[\s\S]{0,120}\b(?:instructions?|prompt|system|developer)\b/gi,
  /(?:^|\n)\s*(?:system|assistant|developer|user)\s*:/gi,
];

export function sanitizeAiInputText(rawText: string, maxChars = 50_000) {
  const bounded = rawText.replace(/\u0000/g, '').slice(0, maxChars);
  const sanitized = AI_INJECTION_PATTERNS.reduce(
    (acc, pattern) => acc.replace(pattern, '[redacted]'),
    bounded
  ).trim();

  return sanitized.length > 0 ? sanitized : bounded.trim();
}

/**
 * The daily ceiling on model calls per user, across every action. Enforced
 * inside `reserve_ai_call` under the same advisory lock as the per-action
 * window, so it can neither race nor fail open.
 */
export const DAILY_AI_CALL_CEILING = 300;

type ReservationOutcome =
  | { ok: true; reservationId: string }
  | { ok: false; error: string };

/**
 * Reserves spend BEFORE a model call (invariant #7). One reservation row may
 * cover several model calls — a drill batch, an enrichment fan-out, a chat
 * turn plus its follow-ups — so `calls` says how many, and the daily ceiling
 * counts calls, not rows.
 *
 * There is no TypeScript fallback any more: the RPC is live and verified by
 * `npm run verify:deployment`, and a fallback that counted rows in a second
 * query was both racy and a weaker limit than the one it shadowed.
 */
export async function reserveAiCall(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  action: AiActionName,
  metadata: Record<string, Json> = {},
  options: { calls?: number } = {},
): Promise<ReservationOutcome> {
  const policy = AI_RATE_LIMITS[action];
  const calls = Math.max(1, Math.floor(options.calls ?? 1));

  const { data: rpcId, error: rpcError } = await supabase.rpc('reserve_ai_call', {
    p_action: action,
    p_window_minutes: policy.windowMinutes,
    p_max_requests: policy.maxRequests,
    p_metadata: { ...metadata, phase: 'reserved' },
    p_calls: calls,
    p_daily_ceiling: DAILY_AI_CALL_CEILING,
  });

  if (!rpcError && rpcId) {
    return { ok: true, reservationId: rpcId };
  }

  const code = (rpcError as { code?: string } | null)?.code;
  const message = rpcError?.message ?? '';

  if (message.includes('AI_RATE_LIMIT') || code === 'P0001') {
    return {
      ok: false,
      error: `AI limit reached for ${action.replace('_', ' ')}. Try again in about ${policy.windowMinutes} minutes.`,
    };
  }
  if (message.includes('AI_DAILY_CEILING') || code === 'P0002') {
    return {
      ok: false,
      error: 'You have reached your daily AI limit. It resets 24 hours after your first request today.',
    };
  }
  if (code === '28000' || message.includes('Unauthorized')) {
    return { ok: false, error: 'You must be logged in.' };
  }

  logger.error('reserveAiCall', 'reservation failed', { action, user_id: userId, code, message });
  return { ok: false, error: 'Unable to check AI usage limits right now. Please try again.' };
}

/**
 * Records the OUTCOME of an AI call.
 *
 * When `reservationId` is set, `reserveAiCall` already inserted the row that
 * the rate limiter counts, and there is nothing further to write: 202609050900
 * puts `FOR UPDATE USING (false)` on ai_usage_logs, so an UPDATE here matches
 * zero rows and PostgREST reports that as success — the write looked like it
 * worked and silently did nothing. Rather than punch a hole in the append-only
 * guarantee (or add the codebase's only SECURITY DEFINER function, which the
 * Phase 5 assertions explicitly forbid), the reservation row stays the single
 * record and the post-hoc detail goes to the structured log, which is where
 * you would look when debugging a specific call anyway.
 *
 * Without a reservation — the legacy path, and any caller that did not reserve —
 * this still inserts, so usage is never uncounted.
 */
export async function recordAiUsage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  action: AiActionName,
  metadata: Record<string, Json> = {},
  reservationId?: string | null,
) {
  if (reservationId) {
    logger.info('ai_usage', 'call completed', {
      action,
      reservation_id: reservationId,
      ...metadata,
    });
    return;
  }

  const { error } = await supabase.from('ai_usage_logs').insert({
    user_id: userId,
    action,
    metadata: { ...metadata, phase: 'completed' },
  });

  if (error) {
    logger.error('ai_usage_logs', 'failed to insert usage row', { message: error.message });
  }
}

export async function touchDeckUpdatedAt(
  supabase: Awaited<ReturnType<typeof createClient>>,
  deckId: string,
  userId: string,
) {
  const { error } = await supabase
    .from('decks')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', deckId)
    .eq('user_id', userId);

  if (error) {
    logger.warn('decks', 'failed to update updated_at', { message: error.message });
  }
}

export async function requireOwnedDeck(deckId: string) {
  // Memoised per request: the insights tab renders four server components
  // that each call an action guarded by this, and they now share one auth
  // round-trip instead of making four.
  const [supabase, user] = await Promise.all([getRequestClient(), getSessionUser()]);

  if (!user) {
    return { error: 'You must be logged in.' as const };
  }

  const { data: deck, error } = await supabase
    .from('decks')
    .select('id, title')
    .eq('id', deckId)
    .eq('user_id', user.id)
    .single();

  if (error || !deck) {
    return { error: 'Deck not found or access denied.' as const };
  }

  return { supabase, user, deck };
}
