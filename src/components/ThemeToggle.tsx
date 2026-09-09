'use client';

import { useTheme } from '@/components/ThemeProvider';
import { Sun, Moon } from 'lucide-react';
import { m, useReducedMotion } from 'framer-motion';

import { motionTransitions } from '@/lib/motion-configs';

/**
 * Theme switch (design system §5, task 8.7).
 *
 * Two spec violations came out of this file:
 *
 *  - an inline `{ type: 'spring', stiffness: 320 }` on hover and tap. Springs
 *    are not a motion token in this system; exactly one survives in the whole
 *    product and it belongs to a card leaving the stack. Hover and press are
 *    durations, and they now come from `motionTransitions`.
 *  - a `backdrop-blur-md` over a translucent `bg-card/60`. §11's second
 *    self-check is "is there any backdrop-blur outside a modal scrim" — this
 *    was one, on a control that sits over ordinary page content.
 *
 * It is a plain control on the flat ground now, and it lives in the account
 * sheet rather than loose in three page headers.
 */
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const reduced = useReducedMotion();
  const isDark = theme === 'dark';
  const crossfade = reduced ? { duration: 0 } : motionTransitions.hover;

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="relative inline-flex size-[34px] shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-control)] border border-[var(--border-control)] bg-transparent text-ink outline-none transition-[background-color,border-color,color] duration-[120ms] ease-out hover:bg-surface-raised active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
    >
      <span className="relative h-4 w-4">
        <m.span
          className="absolute inset-0"
          initial={false}
          animate={{ opacity: isDark ? 1 : 0 }}
          transition={crossfade}
        >
          <Moon className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
        </m.span>
        <m.span
          className="absolute inset-0"
          initial={false}
          animate={{ opacity: isDark ? 0 : 1 }}
          transition={crossfade}
        >
          <Sun className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
        </m.span>
      </span>
    </button>
  );
}
