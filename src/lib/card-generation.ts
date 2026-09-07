/**
 * Pure card-generation helpers: term validation, candidate scoring, and
 * difficulty balancing.
 *
 * Extracted from actions/ai-generate.ts so they can be exported and unit
 * tested — a 'use server' module may only export async functions. The logic is
 * unchanged apart from the pickBalancedCards fix noted below.
 */
import { normalizeForMatch, normalizeWhitespace } from '@/lib/text-normalize';

export type CardDifficultyBand = 'foundational' | 'intermediate' | 'advanced';

export type CandidateCard = {
  front: string;
  back: string;
  score: number;
  difficulty: CardDifficultyBand;
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

  const ordinalHits = text.match(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/gi)?.length ?? 0;
  if (ordinalHits >= 2) {
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

export function parseAndRankGeneratedCards(
  rawCards: unknown[],
  sourceTextLower: string,
  usedFrontKeys: Set<string>,
) {
  const uniqueCandidates = new Map<string, CandidateCard>();

  for (const item of rawCards) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const maybeCard = item as Record<string, unknown>;
    if (typeof maybeCard.front !== 'string' || typeof maybeCard.back !== 'string') {
      continue;
    }

    const normalized = normalizeGeneratedCard({ front: maybeCard.front, back: maybeCard.back });
    if (!isValidTermFront(normalized.front)) {
      continue;
    }

    if (normalized.back.length < MIN_BACK_CHARS || isEnumerationLike(normalized.back)) {
      continue;
    }

    const frontKey = normalizeFrontKey(normalized.front);
    if (!frontKey || usedFrontKeys.has(frontKey)) {
      continue;
    }

    const candidate: CandidateCard = {
      ...normalized,
      score: scoreCandidateCard(normalized, sourceTextLower),
      difficulty: classifyCardDifficulty(normalized),
    };

    const existing = uniqueCandidates.get(frontKey);
    if (!existing || candidate.score > existing.score) {
      uniqueCandidates.set(frontKey, candidate);
    }
  }

  return [...uniqueCandidates.values()].sort((a, b) => b.score - a.score);
}

