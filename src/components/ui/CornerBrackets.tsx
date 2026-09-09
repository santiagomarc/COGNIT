import * as React from 'react';

import { cn } from '@/lib/utils';

type CornerBracketsProps = {
  /** Extra classes for the positioning wrapper, not the brackets themselves. */
  className?: string;
};

/**
 * Four 14px corner rules drawn on the parent's bounds (design system §7.7).
 *
 * This is the system's focus idiom — never a glowing ring. The corners read as
 * a reticle acquiring a target, which suits an instrument; a bloom reads as a
 * game HUD. They travel at `90ms linear` (see `.brk` in `globals.css`),
 * deliberately not a spring.
 *
 * The parent must be positioned. Drive the accent state from the parent, e.g.
 *
 * ```css
 * .flip:focus-visible .brk { border-color: var(--accent); }
 * ```
 *
 * Purely decorative, so it is hidden from assistive technology: the focus it
 * marks is already announced by the focused control itself.
 */
export function CornerBrackets({ className }: CornerBracketsProps) {
  return (
    <span aria-hidden="true" className={cn('pointer-events-none absolute inset-0', className)}>
      <span className="brk brk--tl" />
      <span className="brk brk--tr" />
      <span className="brk brk--bl" />
      <span className="brk brk--br" />
    </span>
  );
}
