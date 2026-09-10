import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Wordmark } from '@/components/ui/shared/Wordmark';

export const metadata = {
  title: 'Page not found · Cognit',
};

/**
 * 404 (design system §1.1, §9.4).
 *
 * What this replaced was the densest concentration of anti-patterns left in the
 * codebase: two infinitely-animating blurred orbs, five looping "floating
 * sparks", a `<Rocket/>` bobbing on a 4-second cycle with a pulsing
 * `<Sparkles/>` clipped to its corner, a translucent card with `backdrop-blur-xl`,
 * and a gradient wash over the top. Eleven animations ran forever on a page
 * whose only job is to get the reader somewhere else.
 *
 * The copy went too. "Lost in Space" and "The neural pathway you're trying to
 * access doesn't exist in our memory banks" said nothing a reader could act on
 * — and "Home Node" is not a place. An error page says what happened and what
 * to do next.
 *
 * It is a server component now: nothing here needs state, an effect, or the
 * animation runtime.
 */
export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12">
      <Wordmark href="/" size="sm" />

      <div className="mt-10 border-t border-border pt-8">
        <p className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
          Error
        </p>
        <p className="mt-2 font-mono text-[52px] font-semibold leading-none tracking-[-0.04em] tnum text-ink">
          404
        </p>

        <h1 className="mt-5 font-serif type-display-lg leading-[1.08] tracking-[-0.02em] text-balance text-ink">
          This page does not exist
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          The link may be mistyped, or the deck it pointed at was deleted. Shared
          deck links also stop working once the owner makes the deck private.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button asChild variant="primary">
            <Link href="/dashboard">Go to your decks</Link>
          </Button>
          <Button asChild>
            <Link href="/">Home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
