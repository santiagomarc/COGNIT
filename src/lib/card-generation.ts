/**
 * Pure card-generation helpers: term validation, candidate scoring, and
 * difficulty balancing.
 *
 * Pure, so they can be unit tested; PDF generation (`/api/generate`) calls
 * them per card as the model's output streams in.
 */
import { normalizeForMatch, normalizeWhitespace } from '@/lib/text-normalize';
import { hasBalancedMath } from '@/lib/rich-text';
import { selectUsableDistractors } from '@/lib/distractors';

export type CardDifficultyBand = 'foundational' | 'intermediate' | 'advanced';

export type CandidateCard = {
  front: string;
  back: string;
  score: number;
  difficulty: CardDifficultyBand;
  /** From the generation call itself (AI-18); empty when the model gave none usable. */
  topicTags: string[];
  /** Exactly three, or empty: selectUsableDistractors' rule. */
  distractors: string[];
};

export const TERM_MAX_WORDS = 4;
export const TERM_HARD_MAX_WORDS = 6;
const TERM_MAX_CHARS = 60;
const MIN_BACK_CHARS = 16;

export function isValidTermFront(front: string) {
  if (!front) {
    return false;
  }

  if (front.length > TERM_MAX_CHARS) {
    return false;
  }

  if (/\?|\n/.test(front)) {
    return false;
  }

  if (/^[\d\s.)-]+$/.test(front)) {
    return false;
  }

  if (/^(what|which|how|why|when|where|who|define|explain|describe)\b/i.test(front)) {
    return false;
  }

  if (/[;:,.!?]$/.test(front)) {
    return false;
  }

  const words = front.split(/\s+/).filter(Boolean);
  if (words.length < 1 || words.length > TERM_HARD_MAX_WORDS) {
    return false;
  }

  return true;
}

export function normalizeGeneratedCard(card: { front: string; back: string }) {
  const front = normalizeWhitespace(card.front).replace(/^['"`]+|['"`]+$/g, '');
  const back = normalizeWhitespace(card.back);
  return { front, back };
}

export function normalizeFrontKey(front: string) {
  return normalizeForMatch(front).replace(/[^a-z0-9\s-]/gi, '');
}

export function isEnumerationLike(text: string) {
  if (/^\s*(?:[-*•]|\d+[.)]|[a-z][.)])\s+/i.test(text)) {
    return true;
  }

  const numberedPoints = text.match(/\b\d+[.)]\s+/g)?.length ?? 0;
  if (numberedPoints >= 2) {
    return true;
  }

  // DISTINCT ordinals, not just two hits. "first-in-first-out" repeats one
  // ordinal and is a compound term, not a list — counting raw hits rejected
  // every queue/FIFO card in a computer-science deck. "first … second" is a
  // genuine enumeration and is still caught.
  const ordinalMatches = text.match(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/gi) ?? [];
  const distinctOrdinals = new Set(ordinalMatches.map((match) => match.toLowerCase()));
  if (distinctOrdinals.size >= 2) {
    return true;
  }

  return false;
}

export function classifyCardDifficulty(card: { front: string; back: string }): CardDifficultyBand {
  const frontWords = card.front.split(/\s+/).filter(Boolean).length;
  const backLen = card.back.length;

  if (frontWords <= 2 && backLen <= 120) {
    return 'foundational';
  }

  if (frontWords >= 3 || backLen >= 210) {
    return 'advanced';
  }

  return 'intermediate';
}

export function scoreCandidateCard(card: { front: string; back: string }, sourceTextLower: string) {
  const words = card.front.split(/\s+/).filter(Boolean);
  let score = 0;

  if (words.length <= 2) {
    score += 6;
  } else if (words.length <= TERM_MAX_WORDS) {
    score += 3;
  } else {
    score -= 4;
  }

  const frontLower = card.front.toLowerCase();
  if (sourceTextLower.includes(frontLower)) {
    score += 5;
  } else {
    const tokenMatches = words.filter((word) => word.length > 2 && sourceTextLower.includes(word.toLowerCase())).length;
    score += tokenMatches;
  }

  if (card.back.length >= 40 && card.back.length <= 260) {
    score += 4;
  } else if (card.back.length > 420) {
    score -= 5;
  }

  if (/\b(is|are|refers to|defined as|describes|means)\b/i.test(card.back)) {
    score += 2;
  }

  if (/\?/.test(card.back)) {
    score -= 3;
  }

  if (isEnumerationLike(card.back)) {
    score -= 7;
  }

  return score;
}

export function pickBalancedCards(candidates: CandidateCard[], maxCount: number) {
  if (candidates.length <= maxCount) {
    return candidates;
  }

  const groups: Record<CardDifficultyBand, CandidateCard[]> = {
    foundational: [],
    intermediate: [],
    advanced: [],
  };

  for (const candidate of candidates) {
    groups[candidate.difficulty].push(candidate);
  }

  const targets: Record<CardDifficultyBand, number> = {
    foundational: Math.max(1, Math.round(maxCount * 0.35)),
    intermediate: Math.max(1, Math.round(maxCount * 0.45)),
    advanced: Math.max(1, maxCount - Math.round(maxCount * 0.35) - Math.round(maxCount * 0.45)),
  };

  const selected: CandidateCard[] = [];
  const taken = new Set<string>();

  // Round 1: each band gets its quota, capped by what it actually has.
  // The `taken` check also guards cross-band duplicates. Callers already
  // deduplicate upstream (parseAndRankGeneratedCards keys by front), but making
  // this hold standalone keeps the function safe to reuse.
  for (const band of ['foundational', 'intermediate', 'advanced'] as const) {
    let quota = Math.max(0, targets[band]);
    for (const candidate of groups[band]) {
      if (quota === 0) break;
      const key = normalizeFrontKey(candidate.front);
      if (taken.has(key)) continue;
      selected.push(candidate);
      taken.add(key);
      quota -= 1;
    }
  }

  // Round 2: fill any remaining slots by SCORE across all bands.
  //
  // The previous version pushed foundational → intermediate → advanced and then
  // truncated with .slice(0, maxCount). Whenever the first two bands over-filled
  // their quota, the cards discarded were the highest-scoring ADVANCED ones —
  // exactly backwards from the stated goal of a balanced spread. Selecting the
  // remainder by score, and only then trimming, keeps the best cards.
  if (selected.length < maxCount) {
    for (const candidate of candidates) {
      if (selected.length >= maxCount) break;
      const key = normalizeFrontKey(candidate.front);
      if (taken.has(key)) continue;
      selected.push(candidate);
      taken.add(key);
    }
  }

  return selected.slice(0, maxCount);
}

/**
 * Tags as the app stores them: trimmed, lowercase, 2–40 characters,
 * deduplicated, at most four. Shared by generation and background enrichment.
 */
export function normalizeTopicTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(
    raw
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.length >= 2 && value.length <= 40),
  )].slice(0, 4);
}

/**
 * One card from the model, checked and scored, or null when it fails a rule:
 * a term-shaped front, a real description, no list, balanced math. Its tags
 * and distractors are cleaned; a card with unusable ones is still a card (the
 * background job fills them later).
 */
export function parseGeneratedCard(item: unknown, sourceTextLower: string): CandidateCard | null {
  if (!item || typeof item !== 'object') return null;

  const raw = item as Record<string, unknown>;
  if (typeof raw.front !== 'string' || typeof raw.back !== 'string') return null;

  const normalized = normalizeGeneratedCard({ front: raw.front, back: raw.back });
  if (!isValidTermFront(normalized.front)) return null;
  if (normalized.back.length < MIN_BACK_CHARS || isEnumerationLike(normalized.back)) return null;

  // A stray `$` would render as a raw dollar sign on the card face; the
  // prompt asks for `$…$` LaTeX, so an unbalanced one is a malformed card.
  if (!hasBalancedMath(normalized.front) || !hasBalancedMath(normalized.back)) return null;

  const distractors = Array.isArray(raw.mcq_distractors)
    ? selectUsableDistractors(raw.mcq_distractors.filter((value): value is string => typeof value === 'string'), normalized.front)
    : [];

  return {
    ...normalized,
    score: scoreCandidateCard(normalized, sourceTextLower),
    difficulty: classifyCardDifficulty(normalized),
    topicTags: normalizeTopicTags(raw.topic_tags),
    distractors,
  };
}

/**
 * Below this score a streamed card is held back instead of shown at once. A
 * one- or two-word term found verbatim in the source with a 40–260 character
 * description scores 15–17, a three- or four-word one 12–14; a five- or
 * six-word term scores at most 7. A held card is not lost: it fills any room
 * left once every section has answered.
 */
export const STREAM_ACCEPT_MIN_SCORE = 8;

/** A section's share of the cards still wanted, so a long document is covered past its opening. */
export function sectionCap(count: number, accepted: number, sectionsLeft: number): number {
  return Math.max(1, Math.ceil(Math.max(0, count - accepted) / Math.max(1, sectionsLeft)));
}

/**
 * How many cards to ask one section for: a little over its share, so a weak
 * card can be passed over; never fewer than three, never more than `max`.
 */
export function sectionRequestSize(cap: number, max: number): number {
  return Math.max(3, Math.min(max, Math.ceil(cap * 1.4)));
}

/**
 * Chooses cards while they stream in (performance plan AI-18). The old
 * pipeline waited for every section, then ranked the whole pool; this decides
 * per card, so a good card is shown and saved the moment the model finishes
 * writing it:
 *
 * - A new card is taken at once when the request still has room, its section
 *   is under its cap, and it scores at least STREAM_ACCEPT_MIN_SCORE.
 * - Anything else that isn't a duplicate is held. When the sections are done,
 *   `fill` takes the best held cards for the room left, balanced by difficulty
 *   as the whole-document pick was.
 *
 * Duplicates are checked against `usedFrontKeys`, which the caller seeds with
 * the deck's existing terms so a second upload adds only new ones.
 */
export function createCardPicker(options: { count: number; usedFrontKeys: Set<string>; minScore?: number }) {
  const minScore = options.minScore ?? STREAM_ACCEPT_MIN_SCORE;
  const caps = new Map<number, number>();
  const taken = new Map<number, number>();
  const held: CandidateCard[] = [];
  let accepted = 0;

  const sectionFull = (section: number) => (taken.get(section) ?? 0) >= (caps.get(section) ?? 0);

  return {
    accepted: () => accepted,
    full: () => accepted >= options.count,
    sectionFull,
    /** Opens a section with room for `cap` cards. */
    open(section: number, cap: number) {
      caps.set(section, cap);
      taken.set(section, 0);
    },
    /** `take`: show and save it now. `hold`: kept for `fill`. `duplicate`: the deck or this run has the term. */
    offer(section: number, candidate: CandidateCard): 'take' | 'hold' | 'duplicate' {
      const key = normalizeFrontKey(candidate.front);
      if (!key || options.usedFrontKeys.has(key)) return 'duplicate';
      options.usedFrontKeys.add(key);

      if (accepted < options.count && !sectionFull(section) && candidate.score >= minScore) {
        accepted += 1;
        taken.set(section, (taken.get(section) ?? 0) + 1);
        return 'take';
      }
      held.push(candidate);
      return 'hold';
    },
    /** Once every section has answered: the best held cards for the room left. */
    fill(): CandidateCard[] {
      const room = options.count - accepted;
      if (room <= 0 || held.length === 0) return [];
      const picked = pickBalancedCards([...held].sort((a, b) => b.score - a.score), room);
      held.length = 0;
      accepted += picked.length;
      return picked;
    },
  };
}
