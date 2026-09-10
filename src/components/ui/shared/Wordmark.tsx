import Link from 'next/link';

import { cn } from '@/lib/utils';

type WordmarkProps = {
  /** Wraps the mark in a link. Omit for a mark that is already inside one. */
  href?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  className?: string;
};

/*
 * `md` and `lg` read the chrome display tokens. `sm`, `xl` and `2xl` are
 * marketing-scale steps that sit outside the token set on purpose — the landing
 * hero is not a page title and should not drag the app's h1 up with it.
 */
const SIZE: Record<NonNullable<WordmarkProps['size']>, string> = {
  sm: 'text-[27px]',
  md: 'type-display',
  lg: 'type-display-xl',
  xl: 'text-[64px] sm:text-[84px] md:text-[98px]',
  '2xl': 'text-[80px] sm:text-[104px] md:text-[124px]',
};

/**
 * The brand mark (design system §6).
 *
 * The name *is* the mark. Renders in the signature Instrument Serif font
 * (`font-serif`) across all sizes, on the 1.5x display scale.
 *
 * Weight 400 only. Instrument Serif ships no bold, so any heavier weight is a
 * browser-synthesised smear — §3.2's No Bold Serif Rule. If the mark reads
 * weak, change the size step, not the weight.
 */
export function Wordmark({ href, size = 'md', className }: WordmarkProps) {
  const isLg = size === 'lg';
  const mark = (
    <span
      className={cn(
        'font-serif tracking-[-0.02em] text-ink leading-none',
        SIZE[size],
        isLg && 'text-balance',
        className
      )}
    >
      Cognit
    </span>
  );

  if (!href) return mark;

  return (
    <Link
      href={href}
      className="inline-flex rounded-[var(--radius-control)] outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      aria-label="Cognit home"
    >
      {mark}
    </Link>
  );
}
