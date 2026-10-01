import * as React from 'react';

import { cn } from '@/lib/utils';

type SwitchProps = Omit<React.ComponentProps<'button'>, 'onChange' | 'role' | 'type'> & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
};

/**
 * A two-state control (design system §7.12, Rev. E): a 36 × 20 track whose
 * edge is a control edge, so it holds 3:1 in both themes (§9). Off is an
 * outline with an --ink-dimmer knob; on is an --ink track with a --bg knob —
 * position and fill both change, so the state never rests on colour alone.
 *
 * A native button with `role="switch"`: Space and Enter toggle it, and the
 * accessible name comes from `aria-label` or an associated `<label>`.
 */
export function Switch({ checked, onCheckedChange, className, disabled, ...props }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border p-[2px]',
        'transition-[background-color,border-color] duration-[120ms] ease-out',
        'outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]',
        'disabled:pointer-events-none disabled:opacity-50',
        checked ? 'border-ink bg-ink' : 'border-[var(--border-control)] bg-transparent',
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          'block size-[14px] rounded-full transition-transform duration-[120ms] ease-out motion-reduce:transition-none',
          checked ? 'translate-x-4 bg-[var(--bg)]' : 'translate-x-0 bg-ink-dimmer',
        )}
      />
    </button>
  );
}
