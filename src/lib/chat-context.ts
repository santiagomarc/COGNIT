/**
 * Whole-deck context for deck chat (performance plan AI-10). A small deck fits
 * in the prompt whole, so chat needs no query embedding, no vector search and
 * no index for it: the first answer starts after one database read instead of
 * an embedding call and a sync. Pure and client-safe; the widget reads the
 * limit to decide whether its "not indexed yet" banner means anything.
 */

/** Decks up to this size go to the model whole. 11 of 12 non-empty decks in production on 2026-10-14. */
export const FULL_CONTEXT_MAX_CARDS = 80;
/** …provided their text fits: ~6k input tokens, small for flash-lite. */
export const FULL_CONTEXT_MAX_CHARS = 24_000;

export type ContextCard = { id: string; front: string; back: string };

/** Whether these cards (the whole deck) can be sent as the context. */
export function fitsWholeDeck(cards: ContextCard[]): boolean {
  if (cards.length === 0 || cards.length > FULL_CONTEXT_MAX_CARDS) return false;
  const chars = cards.reduce((sum, card) => sum + card.front.length + card.back.length, 0);
  return chars <= FULL_CONTEXT_MAX_CHARS;
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'are', 'was', 'what', 'which', 'who', 'how', 'why', 'when', 'where', 'does', 'did',
  'with', 'from', 'that', 'this', 'these', 'those', 'into', 'about', 'between', 'difference', 'explain',
  'mean', 'means', 'meaning', 'tell', 'can', 'you', 'your', 'have', 'has', 'is', 'of', 'in', 'on', 'to', 'a', 'an',
]);

function contentWords(value: string): string[] {
  return (value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((word) => word.length >= 3 && !STOPWORDS.has(word));
}

/**
 * The source chips for a whole-deck answer: the cards sharing the most words
 * with the question, a match in the term counting double. Chips are a pointer
 * to where the answer lives, not the context itself, so a cheap lexical rank
 * is enough; cards that share nothing are left out.
 */
export function rankReferences(cards: ContextCard[], query: string, limit = 5): ContextCard[] {
  const words = new Set(contentWords(query));
  if (words.size === 0) return [];

  return cards
    .map((card, index) => {
      const front = contentWords(card.front);
      const back = contentWords(card.back);
      const score = 2 * front.filter((word) => words.has(word)).length + back.filter((word) => words.has(word)).length;
      return { card, score, index };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.card);
}
