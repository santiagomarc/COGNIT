import { createClient } from '@/lib/supabase/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Json } from '@/lib/database.types';
import { logger } from '@/lib/logger';
import { isMissingDatabaseFunctionError } from '@/lib/supabase-errors';

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
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }

  return new GoogleGenerativeAI(apiKey);
}

export function getGeminiJsonModel() {
  const genai = getGeminiClient();
  return genai.getGenerativeModel({
    model: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
    generationConfig: {
      temperature: 0.4,
      responseMimeType: 'application/json',
      maxOutputTokens: Number(process.env.GEMINI_MODEL_MAX_TOKENS) || 4096,
    },
  });
}

export function getGeminiTextModel() {
  const genai = getGeminiClient();
  return genai.getGenerativeModel({
    model: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
    generationConfig: {
      temperature: 0.5,
      maxOutputTokens: Number(process.env.GEMINI_MODEL_MAX_TOKENS) || 4096,
    },
  });
}

export function getGeminiEmbeddingModel() {
  const genai = getGeminiClient();
  return genai.getGenerativeModel({
    model: process.env.GEMINI_EMBEDDING_MODEL ?? 'text-embedding-004',
  });
}

export function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export function normalizeWhitespace(value: string) {
  return value
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/[ \u00A0]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function normalizeForMatch(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

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

export async function recordAiUsage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  action: AiActionName,
  metadata: Record<string, Json> = {},
  reservationId?: string | null,
) {
  if (reservationId) {
    const { error } = await supabase
      .from('ai_usage_logs')
      .update({
        metadata: { ...metadata, phase: 'completed' },
      })
      .eq('id', reservationId)
      .eq('user_id', userId);

    if (error && !isMissingAiUsageTableError(error.message)) {
      logger.error('ai_usage_logs', 'failed to update usage row', { message: error.message });
    }
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
