import Link from 'next/link';

import { cn } from '@/lib/utils';

type WordmarkProps = {
  /** Wraps the mark in a link. Omit for a mark that is already inside one. */
  href?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

const SIZE: Record<NonNullable<WordmarkProps['size']>, string> = {
  sm: 'text-[27px]',
  md: 'text-[36px]',
  lg: 'text-[66px]',
};

/**
 * The brand mark (design system §6).
 *
 * The name *is* the mark. Renders in the signature Instrument Serif font
 * (`font-serif`) across all sizes, 1.5x scale and font-medium.
 */
export function Wordmark({ href, size = 'md', className }: WordmarkProps) {
  const isLg = size === 'lg';
  const mark = (
    <span
      className={cn(
        'font-serif font-medium tracking-[-0.02em] text-ink leading-none',
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
