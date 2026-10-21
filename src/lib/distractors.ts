import { similarity } from '@/lib/fuzzy';

/**
 * What the model is told a distractor must be, wherever it writes them: the
 * background enrichment job and PDF generation (performance plan AI-18).
 */
export const DISTRACTOR_PROMPT_RULES: readonly string[] = [
  'DISTRACTOR RULES — all of these must hold:',
  '1. PLAUSIBLE: a learner who half-knows the material could pick it. Draw from the same subject area.',
  '2. UNAMBIGUOUSLY WRONG: never a synonym, abbreviation, plural, alternate spelling, or translation of the correct term.',
  '3. MUTUALLY DISTINCT: the three distractors must not be paraphrases of each other.',
  '4. PARALLEL FORM: match the correct term in kind, length, register, and grammatical form (a person gets people, a two-word noun phrase gets two-word noun phrases).',
  '5. Never use "all of the above", "none of the above", or joke options.',
];

/** Above this, a "distractor" is really the same string as another option. */
const DISTRACTOR_MAX_SIMILARITY = 0.85;

function normalizeForMatch(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Rejects distractors that duplicate the correct answer or each other.
 *
 * Without this, MCQMode renders two options as correct, React warns on the
 * duplicate key, and the question has no wrong answer at all. The model is
 * asked for distinct options in the prompt, but a prompt is not a guarantee.
 *
 * Returns [] unless exactly three usable distractors survive: a 3-option MCQ is
 * a materially easier question (33% guess floor vs 25%), so a short set is
 * better handled by falling back to Identification mode.
 *
 * Pure and client-safe: the quiz page runs it on the server, tests run it bare.
 */
export function selectUsableDistractors(
  rawDistractors: string[],
  correctAnswer: string,
  maxSimilarity = DISTRACTOR_MAX_SIMILARITY,
): string[] {
  const accepted: string[] = [];
  const acceptedKeys = new Set<string>([normalizeForMatch(correctAnswer)]);

  for (const raw of rawDistractors) {
    const value = raw?.trim() ?? '';
    if (!value || value.length > 200) continue;

    const key = normalizeForMatch(value);
    if (acceptedKeys.has(key)) continue;                                              // exact duplicate
    if (correctAnswer && similarity(value, correctAnswer) >= maxSimilarity) continue;  // near-duplicate of the answer
    if (accepted.some((a) => similarity(value, a) >= maxSimilarity)) continue;         // near-duplicate of a sibling

    accepted.push(value);
    acceptedKeys.add(key);
    if (accepted.length === 3) break;
  }

  return accepted.length === 3 ? accepted : [];
}

/**
 * Deck terms are real, distinct cards, so only a near-identical string is the
 * same answer. 0.85 (tuned for model output) rejects legitimate parallel terms:
 * "Fourth generation computers" scores ≈ 0.85 against "Fifth generation
 * computers". Containment is checked separately (containsOther).
 */
const SIBLING_MAX_SIMILARITY = 0.93;

/** A deck card as the distractor picker sees it. */
export type DistractorSource = { id: string; front: string; topic_tags: string[] | null };

/** FNV-1a. Cheap and stable, so a card shows the same options every session. */
function stableHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

function wordCount(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

const STOPWORDS = new Set(['the', 'and', 'for', 'of', 'in', 'on', 'to', 'with', 'from', 'by', 'an', 'a']);

/** Content words of a term, lowercase: what "parallel form" shares. */
function contentWords(value: string): Set<string> {
  return new Set(
    (value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((word) => word.length >= 3 && !STOPWORDS.has(word)),
  );
}

/** One term inside the other ("Remote Procedure Calls" in "Remote Procedure Calls (RPC)"): the same answer. */
function containsOther(a: string, b: string): boolean {
  const left = normalizeForMatch(a);
  const right = normalizeForMatch(b);
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  return shorter.length >= 4 && longer.includes(shorter);
}

/**
 * Three wrong options for a card, taken from the other terms in its deck
 * (performance plan AI-09). The deck is the standard distractor pool: its
 * terms are real, from the same subject, and unambiguously not this card's
 * answer, and picking them costs no model call.
 *
 * Candidates score for sharing a topic tag, for sharing content words with
 * the answer ("Fifth generation computers" draws the other generations) and
 * for a similar word count; a stable hash breaks ties. A term that contains
 * the answer, or is contained by it, is the same answer and never offered.
 * The best eight go through selectUsableDistractors, which drops exact and
 * near-duplicates.
 * Returns [] when fewer than three survive (a deck of fewer than four terms).
 */
export function pickSiblingDistractors(card: DistractorSource, deck: DistractorSource[]): string[] {
  const tags = new Set(card.topic_tags ?? []);
  const words = wordCount(card.front);
  const answerWords = contentWords(card.front);

  const ranked = deck
    .filter((other) => other.id !== card.id && other.front.trim().length > 0 && !containsOther(other.front, card.front))
    .map((other) => ({
      front: other.front.trim(),
      score: 2 * (other.topic_tags ?? []).filter((tag) => tags.has(tag)).length
        + 1.5 * [...contentWords(other.front)].filter((word) => answerWords.has(word)).length
        - Math.abs(wordCount(other.front) - words),
      tie: stableHash(`${card.id}:${other.id}`),
    }))
    .sort((a, b) => b.score - a.score || a.tie - b.tie)
    .slice(0, 8)
    .map((candidate) => candidate.front);

  return selectUsableDistractors(ranked, card.front, SIBLING_MAX_SIMILARITY);
}

/**
 * Gives every card without three stored options a set from its deck. Stored
 * options (the AI-written ones from before AI-09) are kept as they are.
 */
export function fillSiblingDistractors<T extends DistractorSource & { mcq_distractors: string[] | null }>(
  cards: T[],
  deck: DistractorSource[],
): T[] {
  return cards.map((card) => {
    if (Array.isArray(card.mcq_distractors) && card.mcq_distractors.length >= 3) return card;
    const siblings = pickSiblingDistractors(card, deck);
    return siblings.length === 3 ? { ...card, mcq_distractors: siblings } : card;
  });
}
