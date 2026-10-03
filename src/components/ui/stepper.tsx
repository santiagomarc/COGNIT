'use client';

import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';

import { cn } from '@/lib/utils';

type StepperProps = {
  id: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  decrementLabel: string;
  incrementLabel: string;
  /** The hint that states the range, so the range is announced with the field. */
  describedBy?: string;
  disabled?: boolean;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

const STEP_BUTTON =
  'flex size-8 items-center justify-center text-ink-dim transition-colors duration-[120ms] hover:text-ink ' +
  'outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ' +
  'disabled:pointer-events-none disabled:opacity-40 max-md:size-11';

/**
 * A bounded whole number (design system §7.12, Rev. E): − and + around a
 * native number input, inside one control edge. The input is the real field,
 * so typing, arrow keys and assistive technology all work; the buttons are
 * shortcuts. The input is 16 px below `md` so iOS does not zoom on focus
 * (MOB-01).
 */
export function Stepper({ id, value, onChange, min, max, decrementLabel, incrementLabel, describedBy, disabled }: StepperProps) {
  // What the user is typing, which may be empty or out of range until it is committed.
  const [draft, setDraft] = useState<string | null>(null);

  const commit = (raw: string) => {
    setDraft(null);
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed)) onChange(clamp(parsed, min, max));
  };

  return (
    <span className="inline-flex items-center rounded-[var(--radius-control)] border border-[var(--border-control)]">
      <button
        type="button"
        className={STEP_BUTTON}
        aria-label={decrementLabel}
        aria-controls={id}
        disabled={disabled || value <= min}
        onClick={() => onChange(clamp(value - 1, min, max))}
      >
        <Minus className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
      </button>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={draft ?? String(value)}
        disabled={disabled}
        aria-describedby={describedBy}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={(event) => commit(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit(event.currentTarget.value);
        }}
        className={cn(
          'h-8 w-12 border-x border-border bg-transparent text-center font-mono text-sm tnum text-ink max-md:h-11 max-md:text-base',
          'outline-hidden focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)]',
          '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
        )}
      />
      <button
        type="button"
        className={STEP_BUTTON}
        aria-label={incrementLabel}
        aria-controls={id}
        disabled={disabled || value >= max}
        onClick={() => onChange(clamp(value + 1, min, max))}
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
      </button>
    </span>
  );
}
