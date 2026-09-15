'use client';

import { forwardRef } from 'react';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/Kbd';
import type { Confidence } from '@/lib/synthesis/types';
import { CONFIDENCE_LABEL, CONFIDENCE_OPTIONS } from '@/lib/synthesis/ui';

type ConfidencePickerProps = {
  value: Confidence | null;
  onChange: (value: Confidence) => void;
  disabled: boolean;
  /** Set after a check was attempted without a choice; the label says so. */
  missing: boolean;
};

const LABEL = 'font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em]';

/**
 * Judgement of learning before the check (audit F1): three states, one tap,
 * `1 / 2 / 3` from the keyboard. Required — the calibration line on the
 * result is worthless without it, and the cost is a keypress.
 */
export const ConfidencePicker = forwardRef<HTMLDivElement, ConfidencePickerProps>(function ConfidencePicker(
  { value, onChange, disabled, missing },
  ref,
) {
  return (
    <div
      ref={ref}
      role="group"
      aria-label="How sure are you?"
      tabIndex={-1}
      className="flex flex-wrap items-center gap-1 outline-hidden"
    >
      <span className={`${LABEL} mr-1`} style={{ color: missing && value === null ? 'var(--ink)' : 'var(--ink-dimmer)' }}>
        {missing && value === null ? 'How sure? Pick one' : 'How sure?'}
      </span>
      {CONFIDENCE_OPTIONS.map((option) => (
        <Button
          key={option}
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          disabled={disabled}
          className="h-[28px] gap-1.5 px-2 text-[12px]"
        >
          {CONFIDENCE_LABEL[option]}
          <Kbd>{option}</Kbd>
        </Button>
      ))}
    </div>
  );
});
