import type { CardState } from '@/index';

export const DEFAULT_SESSION_CARD_COUNT = 10;
export const MIN_SESSION_CARD_COUNT = 5;
export const MAX_SESSION_CARD_COUNT = 50;

export type QuizMode = 'mcq' | 'identification';

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

export function shuffleItems<T>(items: T[]): T[] {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[randomIndex]] = [next[randomIndex], next[index]];
  }
  return next;
}