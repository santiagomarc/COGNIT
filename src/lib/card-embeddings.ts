import type { createClient } from '@/lib/supabase/server';
import { embedTexts, toVectorLiteral } from '@/lib/embeddings';
import { logger } from '@/lib/logger';
import { sanitizeDatabaseError } from '@/lib/server-errors';
import { recordAiUsage, reserveAiCall, sanitizeAiInputText } from '@/app/actions/_shared';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/** One embedding request's worth: the API takes 100 texts, and so does the free tier's per-minute cap. */
export const EMBED_BATCH_SIZE = 100;

export type EmbedResult =
  | { ok: true; synced: number; pending: number; total: number }
  | { ok: false; error: string };

/**
 * Embeds up to `limit` of a deck's cards that have no embedding yet
 * (performance plan AI-13). Shared by the chat widget's sync action and the
 * background jobs that run when cards are made or a deck is visited.
 *
 * This lives in `src/lib`, not a `'use server'` file, because it takes a
 * Supabase client: every export of a Server Action module is a public
 * endpoint. The caller has already checked that the user owns the deck.
 *
 * The counts run before the reservation, so a deck with nothing to embed
 * spends no AI call against the user's limits (AI-14). Model and network
 * failures throw; the caller's guard reports them.
 */
export async function embedPendingCards(
  supabase: SupabaseServerClient,
  userId: string,
  deckId: string,
  options: { limit: number; trigger: string },
): Promise<EmbedResult> {
  // Two cheap COUNT queries instead of fetching every embedding vector (up to
  // ~6MB for a large deck) just to test which rows are null.
  const [
    { count: totalCardCount, error: totalCountError },
    { count: totalPendingCount, error: pendingCountError },
  ] = await Promise.all([
    supabase.from('cards').select('id', { count: 'exact', head: true }).eq('deck_id', deckId),
    supabase.from('cards').select('id', { count: 'exact', head: true }).eq('deck_id', deckId).is('embedding', null),
  ]);

  const countError = totalCountError ?? pendingCountError;
  if (countError) {
    return { ok: false, error: sanitizeDatabaseError(countError, 'Failed to load cards for embedding sync.') };
  }

  const total = totalCardCount ?? 0;
  if (!totalPendingCount) {
    return { ok: true, synced: 0, pending: 0, total };
  }

  const reservation = await reserveAiCall(supabase, userId, 'sync_embeddings', { deck_id: deckId, trigger: options.trigger });
  if (!reservation.ok) {
    return { ok: false, error: reservation.error };
  }

  const { data: pendingCards, error: pendingCardsError } = await supabase
    .from('cards')
    .select('id, front, back')
    .eq('deck_id', deckId)
    .is('embedding', null)
    .order('created_at', { ascending: true })
    .limit(options.limit);

  if (pendingCardsError) {
    return { ok: false, error: sanitizeDatabaseError(pendingCardsError, 'Failed to load cards for embedding sync.') };
  }

  let synced = 0;
  const validCards = (pendingCards ?? [])
    .map((card) => ({ card, payload: sanitizeAiInputText(`${card.front}\n${card.back}`, 2_000) }))
    .filter((entry) => entry.payload.length > 0);

  if (validCards.length > 0) {
    const vectors = await embedTexts(
      validCards.map((entry) => entry.payload),
      // A 100-card batch spends the free tier's whole per-minute quota;
      // waiting out the reset beats failing the sync.
      { taskType: 'RETRIEVAL_DOCUMENT', maxServerDelayMs: 35_000 },
    );

    const updates = validCards
      .map((entry, index) => ({ card_id: entry.card.id, vector: vectors[index] }))
      .filter((entry): entry is { card_id: string; vector: number[] } => Boolean(entry.vector))
      .map((entry) => ({ card_id: entry.card_id, embedding: toVectorLiteral(entry.vector) }));

    // One statement instead of up to 200 UPDATEs (P-4).
    const { data: appliedCount, error: applyError } = await supabase.rpc('apply_card_embeddings_batch', {
      p_deck_id: deckId,
      p_updates: updates,
    });

    if (applyError) {
      // No per-card fallback. That loop skipped failed rows and still
      // reported success, leaving the deck silently under-retrievable.
      logger.error('embedPendingCards', 'apply_card_embeddings_batch failed', {
        code: applyError.code,
        message: applyError.message,
      });
      return { ok: false, error: sanitizeDatabaseError(applyError, 'Failed to save card embeddings.') };
    }

    synced = Number(appliedCount ?? 0);
  }

  const remainingPending = Math.max(0, totalPendingCount - synced);
  const { error: metadataError } = await supabase
    .from('deck_chat_embedding_metadata')
    .upsert({
      deck_id: deckId,
      user_id: userId,
      total_cards: total,
      embedded_cards: total - remainingPending,
      last_sync_at: new Date().toISOString(),
      sync_error_message: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'deck_id,user_id' });

  if (metadataError) {
    logger.warn('embedPendingCards', 'metadata upsert failed', { message: metadataError.message });
  }

  await recordAiUsage(
    supabase,
    userId,
    'sync_embeddings',
    { deck_id: deckId, total_cards: total, synced_cards: synced, trigger: options.trigger },
    reservation,
  );

  return { ok: true, synced, pending: remainingPending, total };
}
