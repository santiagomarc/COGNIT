/*
 * `Button`'s resolved classes, as plain strings, for the two error boundaries.
 *
 * Every route loads both boundary chunks, and Turbopack copies whatever they
 * import into each one, so `Button` (cva, Radix `Slot`) rode along on every
 * page (performance plan §8.4; the measured cost is in `app/error.tsx`). A
 * boundary needs two fixed controls, not a variant engine, so it takes the
 * strings `cn(buttonVariants(...))` produces. `button-class.test.ts` fails the
 * moment either drifts from `Button`, so the look cannot quietly diverge.
 */
export const BUTTON_CLASS = {
  default:
    "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-sm)] font-medium transition-[background-color,border-color,color] duration-[120ms] ease-out active:translate-y-px outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:pointer-events-none disabled:opacity-50 aria-pressed:border-[var(--border-control)] aria-pressed:bg-surface-raised [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 aria-invalid:border-destructive border border-[var(--border-control)] bg-transparent text-ink hover:bg-surface-raised h-[40px] px-4 text-sm",
  primary:
    "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-sm)] transition-[background-color,border-color,color] duration-[120ms] ease-out active:translate-y-px outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:pointer-events-none disabled:opacity-50 aria-pressed:border-[var(--border-control)] aria-pressed:bg-surface-raised [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 aria-invalid:border-destructive border border-[var(--accent)] bg-[var(--accent)] font-semibold text-[var(--accent-ink)] shadow-[var(--elevate-1)] hover:bg-[var(--accent)]/90 h-[40px] px-4 text-sm",
} as const;
