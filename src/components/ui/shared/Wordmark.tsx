import Link from 'next/link';

import { cn } from '@/lib/utils';

type WordmarkProps = {
  /** Wraps the mark in a link. Omit for a mark that is already inside one. */
  href?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

/*
 * Every size reads a display token (UIUX plan DS-09). `sm` was an off-scale
 * 27px and is now the 28px step; `xl` and `2xl` had no consumers and are gone.
 */
const SIZE: Record<NonNullable<WordmarkProps['size']>, string> = {
  sm: 'type-display-md',
  md: 'type-display',
  lg: 'type-display-xl',
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
