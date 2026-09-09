import Link from 'next/link';

import { cn } from '@/lib/utils';

type WordmarkProps = {
  /** Wraps the mark in a link. Omit for a mark that is already inside one. */
  href?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

const SIZE: Record<NonNullable<WordmarkProps['size']>, string> = {
  sm: 'text-base',
  md: 'text-lg',
  lg: 'text-[28px]',
};

/**
 * The brand mark (design system §6).
 *
 * Every unauthenticated surface — landing nav, landing footer, login, password
 * reset, the shared-deck page — used to draw the logo as a `<Sparkles/>` glyph
 * in a tinted rounded box. That is six of the seventeen sparkle instances §1.1
 * names as the reason this redesign exists, and the glyph said nothing: it was
 * not the product's icon, it was a decoration standing next to the name.
 *
 * §6 resolves this without ceremony — "functional or absent; if a label is
 * clearer than a glyph, ship the label". The name *is* the mark. It carries no
 * hue, so it cannot compete with the state channel, and it needs no asset.
 */
export function Wordmark({ href, size = 'md', className }: WordmarkProps) {
  const isLg = size === 'lg';
  const mark = (
    <span
      className={cn(
        'text-ink',
        isLg
          ? 'font-serif text-[44px] font-normal tracking-[-0.015em] text-balance leading-none'
          : cn('font-semibold tracking-[-.03em]', SIZE[size]),
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
