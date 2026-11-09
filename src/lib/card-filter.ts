/** Fewer characters than this match nearly every card, so the filter waits (as ⌘K's does). */
export const CARD_FILTER_MIN_CHARS = 2;

/**
 * The ILIKE pattern for the Cards tab's filter, or null when the query is too
 * short to filter by (IA-04).
 *
 * The pattern goes into a PostgREST `or=(front.ilike.…,back.ilike.…)` filter,
 * where commas, parentheses and quotes are syntax and `*` is an alias for
 * `%`. They are stripped rather than escaped: nobody searches a card for a
 * comma, and an escape that PostgREST reads differently from Postgres would
 * quietly match the wrong cards. `%` and `_` are LIKE wildcards, so they are
 * stripped too. ⌘K's RPC (`search_user_cards_lexical`) searches every deck
 * and caps at 8, which doesn't fit a per-deck list.
 */
export function cardFilterPattern(query: string): string | null {
  const cleaned = query.replace(/[,()"'\\*%_]/g, ' ').replace(/\s+/g, ' ').trim();
  if (cleaned.length < CARD_FILTER_MIN_CHARS) return null;
  return `%${cleaned}%`;
}
