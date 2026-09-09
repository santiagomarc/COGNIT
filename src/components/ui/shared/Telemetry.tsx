import * as React from 'react';

import { cn } from '@/lib/utils';

type TelemetryProps = {
  /** Rendered in the `label` type step: 10px mono, uppercase, 0.16em tracking. */
  label: string;
  /** The reading itself. Always mono, always tabular. */
  value: React.ReactNode;
  /**
   * A state colour, and only when the value *is* a state — due counts, an
   * active streak. Retention and "reviewed today" are readings, not states,
   * and stay `--ink` (§7.9).
   */
  tone?: 'ink' | 'due' | 'learning' | 'mastered' | 'lapsed' | 'streak';
  /** Stack label above value instead of running them inline. */
  orientation?: 'inline' | 'stacked';
  className?: string;
};

const TONE_COLOR: Record<NonNullable<TelemetryProps['tone']>, string> = {
  ink: 'var(--ink)',
  due: 'var(--state-due)',
  learning: 'var(--state-learning)',
  mastered: 'var(--state-mastered)',
  lapsed: 'var(--state-lapsed)',
  streak: 'var(--state-streak)',
};

/**
 * One reading in the telemetry header (design system §7.9) — an uppercase mono
 * label and a tabular mono value:
 *
 * ```
 * DUE 47   RETENTION 87%   STREAK 14d   REVIEWED TODAY 62
 * ```
 *
 * The value is `tabular-nums` without exception: these numbers sit in columns
 * that change while the user watches them, and proportional digits make the
 * whole strip twitch on every update.
 */
export function Telemetry({
  label,
  value,
  tone = 'ink',
  orientation = 'inline',
  className,
}: TelemetryProps) {
  return (
    <div
      className={cn(
        'flex font-mono',
        orientation === 'inline' ? 'items-baseline gap-2' : 'flex-col gap-1',
        className
      )}
    >
      <span className="text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
        {label}
      </span>
      <span
        className="text-[13px] leading-none tnum"
        style={{ color: TONE_COLOR[tone] }}
      >
        {value}
      </span>
    </div>
  );
}
