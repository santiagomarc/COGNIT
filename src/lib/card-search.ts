import type { createClient } from '@/lib/supabase/server';
import { embedTexts, toVectorLiteral } from '@/lib/embeddings';
import { sanitizeDatabaseError } from '@/lib/server-errors';
import { cacheQueryEmbedding, getCachedQueryEmbedding } from '@/lib/query-embedding-cache';
import { recordAiUsage, reserveAiCall, sanitizeAiInputText } from '@/app/actions/_shared';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/** One card the palette can open. `similarity` is null for a text match. */
export type CardSearchResult = {
  id: string;
  deck_id: string;
  deck_title: string;
  front: string;
  back: string;
  similarity: number | null;
};

export type SearchOutcome = { ok: true; results: CardSearchResult[] } | { ok: false; error: string };

/**
 * Card search by text (AI-12): a Postgres ILIKE over the user's own cards,
 * term matches first. No model and no AI reservation, so the palette runs it
 * as the user types.
 */
export async function searchCardsByText(
  supabase: SupabaseServerClient,
  query: string,
  limit = 8,
): Promise<SearchOutcome> {
  const { data, error } = await supabase.rpc('search_user_cards_lexical', { p_query: query, p_limit: limit });
  if (error) {
    return { ok: false, error: sanitizeDatabaseError(error, 'Search failed. Please try again.') };
  }
  return { ok: true, results: (data ?? []).map((row) => ({ ...row, similarity: null })) };
}

/**
 * Card search by meaning: the query embedding against the user's card
 * vectors. A query embedded in the last ten minutes on this instance is
 * reused without a model call and without spending an AI reservation.
 */
export async function searchCardsByMeaning(
  supabase: SupabaseServerClient,
  userId: string,
  query: string,
  limit = 8,
): Promise<SearchOutcome> {
  const sanitizedQuery = sanitizeAiInputText(query, 300);
  if (!sanitizedQuery) {
    return { ok: false, error: 'Search query is empty after sanitization.' };
  }

  let vector = getCachedQueryEmbedding(sanitizedQuery);
  let reservation: Awaited<ReturnType<typeof reserveAiCall>> | null = null;
  if (!vector) {
    reservation = await reserveAiCall(supabase, userId, 'semantic_search');
    if (!reservation.ok) {
      return { ok: false, error: reservation.error };
    }
    const [embedded] = await embedTexts([sanitizedQuery], { taskType: 'RETRIEVAL_QUERY' });
    if (!embedded) {
      return { ok: false, error: 'Failed to generate query embedding.' };
    }
    vector = embedded;
    cacheQueryEmbedding(sanitizedQuery, embedded);
  }

  const { data, error } = await supabase.rpc('search_user_cards_by_embedding', {
    p_user_id: userId,
    p_query_embedding: toVectorLiteral(vector),
    p_limit: limit,
  });
  if (error) {
    return { ok: false, error: sanitizeDatabaseError(error, 'Search failed. Please try again.') };
  }

  if (reservation?.ok) {
    await recordAiUsage(
      supabase,
      userId,
      'semantic_search',
      { query_chars: sanitizedQuery.length, result_count: data?.length ?? 0 },
      reservation,
    );
  }

  return { ok: true, results: (data ?? []) as CardSearchResult[] };
}
