import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * The SM-2 states the tick can report (design system §2.2). `neutral` is the
 * absence of a signal, not a fifth colour.
 */
export type TickState = 'due' | 'learning' | 'mastered' | 'lapsed' | 'streak' | 'neutral' | 'empty';

const STATE_COLOR: Record<TickState, string> = {
  due: 'var(--state-due)',
  learning: 'var(--state-learning)',
  mastered: 'var(--state-mastered)',
  lapsed: 'var(--state-lapsed)',
  streak: 'var(--state-streak)',
  neutral: 'var(--state-neutral)',
  // Nothing to report yet. --ink-faint is legal here precisely because a tick
  // is not text.
  empty: 'var(--ink-faint)',
};

type StateTickProps = {
  state: TickState;
  /**
   * What the colour means, in words. Colour is never the only carrier of
   * meaning (WCAG 1.4.1), so a tick that is not already sitting beside a label
   * or count must name its state here.
   */
  label?: string;
  className?: string;
};

/**
 * A 2px × 16px state-coloured bar (design system §7.5).
 *
 * This is the replacement for status pills, emoji markers and coloured icons:
 * it encodes one fact from the scheduler in the smallest mark that can carry
 * it, and it is the only hue permitted on a deck row.
 */
export function StateTick({ state, label, className }: StateTickProps) {
  return (
    <span
      className={cn('inline-block h-4 w-[2px] shrink-0 rounded-[1px]', className)}
      style={{ backgroundColor: STATE_COLOR[state] }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
