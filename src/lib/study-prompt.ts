/**
 * Identification prompts without a model (performance plan AI-09).
 *
 * A card's description often names its own term ("Photosynthesis is the
 * process…"), which gives the answer away when the description is the prompt.
 * The AI-written question used to fix that; masking the term does the same
 * job deterministically. Pure, so the quiz runs it in the browser and the
 * server stores the same text with each result.
 */

const BLANK = '____';

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Replaces every whole-phrase, case-insensitive use of `term` (and its simple plural) with a blank. */
export function maskTerm(text: string, term: string): string {
  const phrase = term.trim();
  if (phrase.length < 2) return text;

  const words = phrase.split(/\s+/).map(escapeRegExp).join('\\s+');
  // Not inside a longer word on either side; "cell" must not blank "cellular".
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${words}(?:e?s)?(?![\\p{L}\\p{N}])`, 'giu');
  return text.replace(pattern, BLANK);
}

/** What a quiz asks: the card's AI-written question when it has one, else its masked description. */
export function quizPrompt(card: { front: string; back: string; id_question: string | null }): string {
  return card.id_question ?? maskTerm(card.back, card.front);
}
