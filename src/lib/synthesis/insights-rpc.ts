import 'server-only';
import { z } from 'zod';
import type { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import type { SynthesisInsights } from '@/lib/synthesis/loaders';
import { MISCONCEPTION_KINDS, isDrillVerdict, isSynthesisFormat, type MisconceptionKind } from '@/lib/synthesis/types';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const insightsSchema = z.object({
  attempt_count: z.number(),
  weak_links: z.array(z.object({ card_id: z.string(), term: z.string(), missing: z.number(), contradicted: z.number(), last_at: z.string() })),
  format_rates: z.array(z.object({ format: z.string(), attempts: z.number(), sound: z.number() })),
  outside_claims_30d: z.number(),
  misconceptions_30d: z.record(z.string(), z.number()),
  calibration_30d: z.number().nullable(),
  daily: z.array(z.object({ date: z.string(), attempts: z.number(), links_covered: z.number(), links_total: z.number() })),
  history: z.array(z.object({
    attempt_id: z.string(),
    drill_id: z.string(),
    prompt_text: z.string(),
    format: z.string(),
    verdict: z.string(),
    links_covered: z.number(),
    links_total: z.number(),
    duration_ms: z.number(),
    created_at: z.string(),
  })),
});

/**
 * Insights from `get_synthesis_insights` (plan §6.4): the same readings as
 * the Node aggregation in insights.ts, computed in Postgres and uncapped, in
 * one round trip. Returns null on any error or unexpected shape, so the
 * caller can fall back to the Node path while both exist.
 */
export async function loadSynthesisInsightsRpc(
  supabase: SupabaseServerClient,
  input: { deckId: string; now?: Date },
): Promise<SynthesisInsights | null> {
  const { data, error } = await supabase.rpc('get_synthesis_insights', {
    p_deck_id: input.deckId,
    ...(input.now ? { p_now: input.now.toISOString() } : {}),
  });
  if (error) {
    logger.warn('synthesis', 'get_synthesis_insights failed', { message: error.message });
    return null;
  }
  const parsed = insightsSchema.safeParse(data);
  if (!parsed.success) {
    logger.error('synthesis', 'get_synthesis_insights returned an unexpected shape');
    return null;
  }
  const raw = parsed.data;

  const misconceptions30d: Partial<Record<MisconceptionKind, number>> = {};
  for (const kind of MISCONCEPTION_KINDS) {
    const count = raw.misconceptions_30d[kind];
    if (count) misconceptions30d[kind] = count;
  }

  return {
    attemptCount: raw.attempt_count,
    weakLinks: raw.weak_links.map((row) => ({ cardId: row.card_id, term: row.term, missing: row.missing, contradicted: row.contradicted, lastAt: row.last_at })),
    formatRates: raw.format_rates.flatMap((row) => (isSynthesisFormat(row.format) ? [{ format: row.format, attempts: row.attempts, sound: row.sound }] : [])),
    outsideClaims30d: raw.outside_claims_30d,
    misconceptions30d,
    calibration30d: raw.calibration_30d,
    daily: raw.daily.map((point) => ({ date: point.date, attempts: point.attempts, linksCovered: point.links_covered, linksTotal: point.links_total })),
    history: raw.history.flatMap((row) => (isSynthesisFormat(row.format) && isDrillVerdict(row.verdict)
      ? [{
        attemptId: row.attempt_id,
        drillId: row.drill_id,
        promptText: row.prompt_text,
        format: row.format,
        verdict: row.verdict,
        linksCovered: row.links_covered,
        linksTotal: row.links_total,
        durationMs: row.duration_ms,
        createdAt: row.created_at,
      }]
      : [])),
  };
}
