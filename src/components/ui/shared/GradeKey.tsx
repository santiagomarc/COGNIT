'use client';

import * as React from 'react';

import { projectedInterval } from '@/lib/grade-interval';
import { type SM2Input, type StudyGrade } from '@/lib/sm2';
import { cn } from '@/lib/utils';

/**
 * Grade → state colour (design system §2.2), including the deliberate
 * asymmetry: **easy is colourless**.
 *
 * Easy means "no friction" — the absence of a signal is the signal. Four
 * saturated keys would compete with the card the user is trying to read. Do not
 * "fix" this by giving easy a hue.
 */
const GRADE_STATE: Record<StudyGrade, string> = {
  again: 'var(--state-lapsed)',
  hard: 'var(--state-due)',
  good: 'var(--state-mastered)',
  easy: 'var(--state-neutral)',
};

const GRADE_LABEL: Record<StudyGrade, string> = {
  again: 'Again',
  hard: 'Hard',
  good: 'Good',
  easy: 'Easy',
};

/** The digit that triggers each grade — see §7.3's binding inventory. */
const GRADE_KEYCAP: Record<StudyGrade, string> = {
  again: '1',
  hard: '2',
  good: '3',
  easy: '4',
};

type GradeKeyProps = {
  grade: StudyGrade;
  /** The card's current scheduling state, used to compute the real interval. */
  card: SM2Input;
  onCommit: (grade: StudyGrade) => void;
  disabled?: boolean;
  /** Set while the matching number key is held, so the detent mirrors it. */
  isDown?: boolean;
  className?: string;
};

/**
 * One grade key (design system §7.4) — the single place the flat system yields.
 *
 * Grading is performed ~50 times a session, by hand, under time pressure. A
 * flat 1px cell gives no confirmation that the press registered, so this key
 * has a chamfered face, a 2px state edge along the top, and 1px of travel on
 * press ("Detent"): the inner highlight inverts to an inner shadow and the
 * interval readout rolls like an odometer.
 *
 * Everything tactile here is guarded: the roll is CSS that
 * `prefers-reduced-motion` disables, and the haptic is feature-detected and
 * suppressed for the same users.
 */
export function GradeKey({
  grade,
  card,
  onCommit,
  disabled = false,
  isDown = false,
  className,
}: GradeKeyProps) {
  const interval = projectedInterval(grade, card);
  const label = GRADE_LABEL[grade];

  function handleClick() {
    if (disabled) return;

    /*
     * Haptic confirmation on touch, where there is no key travel to feel.
     * Guarded three ways: the API is not universal (absent on iOS Safari), it
     * throws in some embedded webviews, and a reduced-motion preference should
     * silence it along with the visual motion.
     */
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      const reduced =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      if (!reduced) {
        try {
          navigator.vibrate(10);
        } catch {
          // A refused haptic must never interrupt a grade commit.
        }
      }
    }

    onCommit(grade);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      data-down={isDown ? 'true' : undefined}
      data-grade={grade}
      className={cn('key', className)}
      style={{ '--key-state': GRADE_STATE[grade] } as React.CSSProperties}
      // The visible keycap is decorative to AT; the accessible name carries the
      // same three facts the sighted user reads off the key.
      aria-label={`${label}, key ${GRADE_KEYCAP[grade]}, next review in ${interval}`}
    >
      <span className="kk" aria-hidden="true">
        {GRADE_KEYCAP[grade]}
      </span>
      <span className="kn">{label}</span>
      {/*
        Re-keying on the value restarts the roll: React remounts the digits, so
        each one replays its staggered entry instead of silently swapping.
      */}
      <span className="ki odo" key={interval} aria-hidden="true">
        {interval.split('').map((char, i) => (
          <span
            key={`${char}-${i}`}
            className="odo__d"
            style={{ '--odo-i': i } as React.CSSProperties}
          >
            {char}
          </span>
        ))}
      </span>
    </button>
  );
}
