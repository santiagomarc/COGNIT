/**
 * SM-2 Spaced Repetition Algorithm
 *
 * Based on Piotr Wozniak's SuperMemo-2 algorithm (1987).
 *
 * Grades (0-5):
 *   0 — "Blackout"  (complete failure to recall)
 *   1 — "Wrong"     (incorrect response; correct one remembered upon seeing it)
 *   2 — "Hard"      (incorrect response; correct one seemed easy to recall)
 *   3 — "Good"      (correct response with serious difficulty)
 *   4 — "Easy"      (correct response after hesitation)
 *   5 — "Perfect"   (instant correct response)
 *
 * We expose only 4 buttons to the user: Again (0), Hard (2), Good (4), Easy (5).
 * The other grades are available if you ever want a 6-button UI.
 *
 * ── How It Works ───────────────────────────────────────────────────
 * After each review the algorithm updates three values:
 *   • repetition_count — resets to 0 on failure, increments on success
 *   • ease_factor — adjusts difficulty (clamped ≥ 1.3)
 *   • interval — days until the next review
 *
 * The next review date = now + interval days.
 */

import type { CardState } from '@/index';

// ── Types ──

export type SM2Grade = 0 | 1 | 2 | 3 | 4 | 5;

/** The user-facing buttons we show during study */
export type StudyGrade = 'again' | 'hard' | 'good' | 'easy';

/** Maps user-facing button → SM-2 numeric grade */
export const GRADE_MAP: Record<StudyGrade, SM2Grade> = {
  again: 0,
  hard: 2,
  good: 4,
  easy: 5,
} as const;

export interface SM2Input {
  repetitionCount: number;
  easeFactor: number;
  interval: number;
  state: CardState;
}

export interface SM2Output {
  repetitionCount: number;
  easeFactor: number;
  interval: number;
  state: CardState;
  nextReviewAt: Date;
}

// ── Constants ──

const MIN_EASE_FACTOR = 1.3;
const DEFAULT_EASE_FACTOR = 2.5;
const LEARNING_STEPS_MINUTES = [1, 10]; // minutes until first real review
const MAX_INTERVAL_DAYS = 365;

function toSafeNonNegativeInt(value: number, fallback = 0) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.floor(value));
}

function toSafeEaseFactor(value: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_EASE_FACTOR;
  }

  return Math.max(value, MIN_EASE_FACTOR);
}

// ── Algorithm ──

/**
 * Calculate the next SM-2 state for a card given a grade.
 *
 * @param grade  — Numeric SM-2 grade (0-5)
 * @param prev   — The card's current scheduling state
 * @returns        New scheduling state + next review date
 */
export function sm2(grade: SM2Grade, prev: SM2Input): SM2Output {
  const now = new Date();
  const safeRepetitionCount = toSafeNonNegativeInt(prev.repetitionCount, 0);
  const safeEaseFactor = toSafeEaseFactor(prev.easeFactor);
  const safeInterval = toSafeNonNegativeInt(prev.interval, 0);

  // ── Failed review (grade < 3) → Reset ──
  if (grade < 3) {
    return {
      repetitionCount: 0,
      easeFactor: Math.max(safeEaseFactor - 0.2, MIN_EASE_FACTOR),
      interval: 0,
      state: prev.state === 'new' ? 'learning' : 'relearning',
      nextReviewAt: addMinutes(now, LEARNING_STEPS_MINUTES[0]),
    };
  }

  // ── Successful review (grade ≥ 3) ──
  let repetitionCount = safeRepetitionCount;
  let easeFactor = safeEaseFactor;
  let interval = safeInterval;

  // Update ease factor using SM-2 formula
  easeFactor =
    easeFactor + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02));
  easeFactor = Math.max(easeFactor, MIN_EASE_FACTOR);

  // Calculate new interval
  if (prev.state === 'new' || prev.state === 'learning') {
    // First successful review → 1 day
    if (repetitionCount === 0) {
      interval = 1;
    } else if (repetitionCount === 1) {
      interval = 6;
    } else {
      interval = Math.round(interval * easeFactor);
    }
  } else if (prev.state === 'relearning') {
    // Coming back from a lapse → shorter interval
    interval = 1;
  } else {
    // Normal review cycle
    if (repetitionCount === 0) {
      interval = 1;
    } else if (repetitionCount === 1) {
      interval = 6;
    } else {
      interval = Math.round(interval * easeFactor);
    }
  }

  // Bonus for "Easy" — stretch interval by 30%
  if (grade === 5) {
    interval = Math.round(interval * 1.3);
  }

  // Cap at 365 days (1 year max interval)
  if (!Number.isFinite(interval)) {
    interval = 0;
  }
  interval = Math.max(0, Math.min(interval, MAX_INTERVAL_DAYS));

  repetitionCount += 1;

  return {
    repetitionCount,
    easeFactor,
    interval,
    state: 'review',
    nextReviewAt: addDays(now, interval),
  };
}

/**
 * Convenience: get default SM-2 values for a brand-new card.
 */
export function defaultSM2(): SM2Input {
  return {
    repetitionCount: 0,
    easeFactor: DEFAULT_EASE_FACTOR,
    interval: 0,
    state: 'new',
  };
}

// ── Date helpers (no external deps) ──

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
