import type { createClient } from '@/lib/supabase/server';
import type { BackgroundOutcome } from '@/lib/background';
import { EMBED_BATCH_SIZE, embedPendingCards } from '@/lib/card-embeddings';
import { enrichPendingCards } from '@/lib/card-enrichment';
import { logger } from '@/lib/logger';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/** The free tier's quota window. Deck-visit backfills run at most once per window. */
export const BACKFILL_MIN_INTERVAL_SECONDS = 60;

/**
 * Fills what a deck's new cards still lack, in the background: one batch of
 * embeddings (search, chat; AI-13), then AI distractors and topic tags
 * (PERF-10). Scheduled with
 * `after()` by imports and PDF generation, and by the deck-visit backfill
 * route; a refused reservation or a model failure leaves the rest for the next
 * run. Each half runs even if the other fails. The caller has checked ownership.
 */
export async function fillDerivedCardData(
  supabase: SupabaseServerClient,
  userId: string,
  deckId: string,
  options: { trigger: string; enrichMinimum?: number },
): Promise<BackgroundOutcome> {
  let didWork = false;
  let failed = false;

  try {
    const embedded = await embedPendingCards(supabase, userId, deckId, { limit: EMBED_BATCH_SIZE, trigger: options.trigger });
    if (!embedded.ok) failed = true;
    else didWork ||= embedded.synced > 0;
  } catch (error) {
    failed = true;
    logger.warn('fillDerivedCardData', 'embedding failed', { deckId, message: error instanceof Error ? error.message : String(error) });
  }

  try {
    const enriched = await enrichPendingCards(supabase, userId, deckId, { minimum: options.enrichMinimum, trigger: options.trigger });
    if (!enriched.ok) failed = true;
    else didWork ||= enriched.enriched > 0;
  } catch (error) {
    failed = true;
    logger.warn('fillDerivedCardData', 'enrichment failed', { deckId, message: error instanceof Error ? error.message : String(error) });
  }

  return failed ? 'failed' : didWork ? 'ok' : 'skipped';
}

/** Whether a background fill already reserved an AI call for this user within the window. */
export async function derivedDataRanRecently(
  supabase: SupabaseServerClient,
  seconds = BACKFILL_MIN_INTERVAL_SECONDS,
): Promise<boolean> {
  const since = new Date(Date.now() - seconds * 1000).toISOString();
  const { data, error } = await supabase
    .from('ai_usage_logs')
    .select('id')
    .in('action', ['sync_embeddings', 'enrich_cards'])
    .gte('created_at', since)
    .limit(1);
  // Fail open: a read error shouldn't stop the backfill; the reservation
  // limits still bound it.
  return !error && (data?.length ?? 0) > 0;
}
