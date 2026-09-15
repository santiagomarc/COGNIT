import type { CardState } from '@/index';

export const DEFAULT_SESSION_CARD_COUNT = 10;
export const MIN_SESSION_CARD_COUNT = 5;
export const MAX_SESSION_CARD_COUNT = 50;

export type QuizMode = 'mcq' | 'identification';
export type StudyScope = 'due' | 'include_reviewed' | 'unmastered_only';

export type StudySessionCard = {
  id: string;
  front: string;
  back: string;
  state: CardState;
  interval: number;
  ease_factor: number;
  repetition_count: number;
  mcq_distractors: string[] | null;
  id_question: string | null;
  topic_tags: string[] | null;
  mnemonic: string | null;
};

export function getSessionCardBounds(availableCount: number) {
  const safeAvailableCount = Math.max(0, availableCount);

  if (safeAvailableCount === 0) {
    return { min: 0, max: 0, defaultCount: 0 };
  }

  const max = Math.min(MAX_SESSION_CARD_COUNT, safeAvailableCount);
  const min = Math.min(MIN_SESSION_CARD_COUNT, max);
  const defaultCount = Math.min(DEFAULT_SESSION_CARD_COUNT, max);

  return { min, max, defaultCount };
}

export function normalizeSessionCardCount(rawCount: string | string[] | undefined, availableCount = MAX_SESSION_CARD_COUNT): number {
  const countValue = Array.isArray(rawCount) ? rawCount[0] : rawCount;
  const parsedCount = Number.parseInt(countValue ?? '', 10);
  const { min, max, defaultCount } = getSessionCardBounds(availableCount);

  if (max === 0) {
    return 0;
  }

  if (!Number.isFinite(parsedCount)) {
    return defaultCount;
  }

  return Math.min(max, Math.max(min, parsedCount));
}

export function normalizeQuizMode(rawMode: string | string[] | undefined): QuizMode {
  const modeValue = Array.isArray(rawMode) ? rawMode[0] : rawMode;
  return modeValue === 'identification' ? 'identification' : 'mcq';
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * An explicit card list for a session (`?cards=id,id,…`): the drill canvas
 * hands the cards it pulled forward straight to a review, and Insights hands
 * over the weak-link cards. Unknown or malformed ids are dropped, duplicates
 * collapsed, and the list is capped at the session maximum. Empty means
 * "no explicit list" — the scope decides as usual.
 */
export function parseSessionCardIds(raw: string | string[] | undefined): string[] {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return [];
  const ids = value.split(',').map((id) => id.trim()).filter((id) => UUID_PATTERN.test(id));
  return [...new Set(ids)].slice(0, MAX_SESSION_CARD_COUNT);
}

export function normalizeStudyScope(rawScope: string | string[] | undefined): StudyScope {
  const scopeValue = Array.isArray(rawScope) ? rawScope[0] : rawScope;

  if (scopeValue === 'include_reviewed') {
    return 'include_reviewed';
  }

  if (scopeValue === 'unmastered_only') {
    return 'unmastered_only';
  }

  return 'due';
}

export function shuffleItems<T>(items: T[]): T[] {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[randomIndex]] = [next[randomIndex], next[index]];
  }
  return next;
}

/**
 * Buckets the per-card next-review timestamps into a human sentence, e.g.
 * "8 cards due tomorrow · 3 in 6 days". Only the two nearest buckets are shown;
 * beyond that the detail stops being useful.
 */
export function summariseNextReviews(timestamps: string[], now = Date.now()): string | null {
  if (timestamps.length === 0) return null;

  const buckets = new Map<number, number>();
  for (const iso of timestamps) {
    const at = new Date(iso).getTime();
    if (!Number.isFinite(at)) continue;
    const days = Math.max(0, Math.round((at - now) / 86_400_000));
    buckets.set(days, (buckets.get(days) ?? 0) + 1);
  }

  if (buckets.size === 0) return null;

  const label = (days: number) => {
    if (days === 0) return 'later today';
    if (days === 1) return 'tomorrow';
    return `in ${days} days`;
  };

  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .slice(0, 2)
    .map(([days, count]) => `${count} card${count === 1 ? '' : 's'} ${label(days)}`)
    .join(' · ');
}
