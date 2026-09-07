import { createClient } from '@/lib/supabase/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Json } from '@/lib/database.types';
import { logger } from '@/lib/logger';
import { isMissingDatabaseFunctionError } from '@/lib/supabase-errors';
import { getServerEnv } from '@/lib/env-server';

export type AiActionName =
  | 'generate_cards'
  | 'enrich_cards'
  | 'sanitize_notes'
  | 'get_hint'
  | 'generate_mnemonic'
  | 'chat_with_deck'
  | 'sync_embeddings'
  | 'semantic_search';

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

export function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export { normalizeForMatch, normalizeWhitespace } from '@/lib/text-normalize';

function isMissingAiUsageTableError(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes('ai_usage_logs') && normalized.includes('does not exist');
}

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

const DAILY_AI_CALL_CEILING = 300;

export async function enforceDailyAiBudget(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
) {
  const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const { count, error } = await supabase
    .from('ai_usage_logs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', since);

  if (error) return null; // fail open on the ceiling; per-action limits still apply
  return (count ?? 0) >= DAILY_AI_CALL_CEILING
    ? 'You have reached your daily AI limit. It resets 24 hours after your first request today.'
    : null;
}

export async function enforceAiRateLimit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  action: AiActionName,
) {
  const policy = AI_RATE_LIMITS[action];
  const cutoffIso = new Date(Date.now() - policy.windowMinutes * 60_000).toISOString();

  const { count, error } = await supabase
    .from('ai_usage_logs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('action', action)
    .gte('created_at', cutoffIso);

  if (error) {
    // The missing-table fallback only applies outside production: it exists so a
    // fresh local checkout works before migrations are applied, never so a dropped
    // or renamed table in production can silently disable AI spend limits.
    if (isMissingAiUsageTableError(error.message) && process.env.NODE_ENV !== 'production') {
      return null;
    }
    return 'Unable to check AI usage limits right now. Please try again.';
  }

  if ((count ?? 0) >= policy.maxRequests) {
    return `AI limit reached for ${action.replace('_', ' ')}. Try again in about ${policy.windowMinutes} minutes.`;
  }

  return null;
}

export async function reserveAiCall(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  action: AiActionName,
  metadata: Record<string, Json> = {},
): Promise<{ ok: true; reservationId: string | null } | { ok: false; error: string }> {
  const dailyError = await enforceDailyAiBudget(supabase, userId);
  if (dailyError) return { ok: false, error: dailyError };

  const policy = AI_RATE_LIMITS[action];

  // Try the atomic RPC first (202609060915_atomic_ai_reservation.sql)
  const rpcCaller = supabase.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: string | null; error: { message: string; code?: string } | null }>;

  const { data: rpcId, error: rpcError } = await rpcCaller('reserve_ai_call', {
    p_action: action,
    p_window_minutes: policy.windowMinutes,
    p_max_requests: policy.maxRequests,
    p_metadata: { ...metadata, phase: 'reserved' },
  });

  if (!rpcError && rpcId) {
    return { ok: true, reservationId: rpcId };
  }

  if (rpcError) {
    if (rpcError.message?.includes('AI_RATE_LIMIT') || (rpcError as { code?: string }).code === 'P0001') {
      return {
        ok: false,
        error: `AI limit reached for ${action.replace('_', ' ')}. Try again in about ${policy.windowMinutes} minutes.`,
      };
    }
    if (!isMissingDatabaseFunctionError(rpcError.message, 'reserve_ai_call')) {
      logger.warn('reserveAiCall', 'rpc call failed, using TypeScript fallback', { message: rpcError.message });
    }
  }

  // TypeScript fallback path
  const limitError = await enforceAiRateLimit(supabase, userId, action);
  if (limitError) return { ok: false, error: limitError };

  const { data, error } = await supabase
    .from('ai_usage_logs')
    .insert({ user_id: userId, action, metadata: { ...metadata, phase: 'reserved' } })
    .select('id')
    .single();

  if (error && !isMissingAiUsageTableError(error.message)) {
    logger.error('reserveAiCall', 'usage insert failed', { action, message: error.message });
  }

  return { ok: true, reservationId: data?.id ?? null };
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

  if (error && !isMissingAiUsageTableError(error.message)) {
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
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

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
