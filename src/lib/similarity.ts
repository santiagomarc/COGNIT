/**
 * Cosine-similarity floors for `gemini-embedding-001` at 768 dimensions
 * (`outputDimensionality: 768`, `vector_cosine_ops`, pgvector `1 - (a <=> b)`).
 *
 * Measured 2026-09-23 on a synthetic three-topic set with the app's exact
 * request shape (COGNIT_NEXT_HORIZON_PLAN.md §1.3, Appendix B). Two different
 * distributions, so two families of constants — never reuse one for the other:
 *
 *   query → card   RETRIEVAL_QUERY against RETRIEVAL_DOCUMENT (deck chat, the
 *                  question bank). Covered questions ≥ 0.678, same-subject
 *                  questions the deck lacks ≤ 0.644, off-topic ≤ 0.544.
 *   card ↔ card    RETRIEVAL_DOCUMENT on both sides (drill clustering, the repair
 *                  partner). Within one topic every pair is ≥ 0.746; across
 *                  topics ≤ 0.788 (p95 0.766). A query floor applied here
 *                  rejects nothing.
 *
 * The vectors are NOT unit length at 768 dimensions (|v| ≈ 0.59). Cosine
 * distance does not care; an inner-product operator (`<#>`) would. Normalise
 * before ever switching operator class.
 *
 * Re-measure with `npm run ai:retrieval` before changing any value.
 */

/** Query → card: below this, a retrieved card is not evidence the deck covers the question. */
export const QUERY_CARD_FLOOR = 0.62;

/** A past-paper question maps only to cards within this band of its best match. */
export const QUESTION_MATCH_BAND = 0.06;

/** Card ↔ card: a neighbour that may share a drill. Rejects ~92 % of cross-topic pairs, ~2 % within a topic. */
export const NEIGHBOUR_FLOOR = 0.76;

/** Card ↔ card: close enough to be confused, so a repair drill asks to *distinguish* them. */
export const CONFUSABLE_FLOOR = 0.86;

type ScoredCard = { id: string; similarity: number | null };

/**
 * The cards a pasted exam question actually reaches: the best match must
 * clear the query floor, and only cards within `QUESTION_MATCH_BAND` of it
 * count. The old flat floor of 0.45 sat below the off-topic band, so every
 * question — a Macbeth essay against an operating-systems deck included —
 * "matched" all eight cards it was offered.
 */
export function questionMatches(rows: readonly ScoredCard[]): string[] {
  const scored = rows.filter((row): row is { id: string; similarity: number } => row.similarity !== null);
  if (scored.length === 0) return [];
  const best = Math.max(...scored.map((row) => row.similarity));
  if (best < QUERY_CARD_FLOOR) return [];
  const floor = Math.max(QUERY_CARD_FLOOR, best - QUESTION_MATCH_BAND);
  return scored.filter((row) => row.similarity >= floor).map((row) => row.id);
}
