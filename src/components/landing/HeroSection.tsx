'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Kbd } from '@/components/ui/Kbd';
import { Wordmark } from '@/components/ui/shared/Wordmark';
import { FadeInUp } from '@/components/motion';

/*
 * The mock dashboard beneath the fold. It is a specimen of the real deck index
 * (§7.5) — state tick, name, right-aligned mono numerics — rather than a
 * drawing of one. Showing the actual instrument is both more honest marketing
 * and the only version that cannot drift from the product.
 */
const SPECIMEN_DECKS = [
  { name: 'Automata Theory', cards: 24, due: 7, mastery: 62, state: 'var(--state-due)' },
  { name: 'Data Structures', cards: 18, due: 0, mastery: 88, state: 'var(--state-mastered)' },
  { name: 'Linear Algebra', cards: 31, due: 3, mastery: 41, state: 'var(--state-learning)' },
];

/**
 * The landing hero (design system §1.1, §9.2).
 *
 * What left, and why each was not a matter of taste:
 *
 *  - **Three blurred gradient orbs** (two full-page, one glow under the mockup).
 *    §1.1 names decorative blurred orbs "the single loudest AI-template tell".
 *  - **Two `<Sparkles/>`** — one as the logo, one in a badge reading
 *    "AI-Powered Active Recall", which is a claim about the vendor rather than
 *    a fact about the reader.
 *  - **A gradient-clipped headline.** §1.1 bans gradient text outright.
 *  - **`<Brain/>`** inside the mockup, plus a `colorMap` indirection that only
 *    existed because two deck tiles wanted different tints.
 *  - **A scroll-linked parallax** on the mockup (`useScroll` + three
 *    `useTransform`s + a spring), which ran a transform on every scroll frame.
 *
 * It also fixes a **hydration mismatch under `prefers-reduced-motion`**
 * (pre-existing, reproduced at baseline). The old code passed
 * `initial={reduced ? undefined : {...}}` to a raw `m.div`. Framer's
 * `useReducedMotion()` cannot know the user's preference during SSR, so the
 * server always rendered the *animated* branch — `opacity: 0` and a transform —
 * and a reduced-motion client then rendered the *unanimated* branch, so React
 * found markup it did not expect. Motion here now goes through `FadeInUp`,
 * which resolves the preference behind a `useSyncExternalStore` mounted check:
 * server and first client render are byte-identical resting states, and motion
 * only starts once hydration has happened and the preference is actually known.
 *
 * Per the plan the landing may keep more expressive motion than the app; what
 * it may not keep is anything on §1.1's list.
 */
export function HeroSection() {
  return (
    <section className="relative">
      {/* ── Navbar ── */}
      <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-5">
        <Wordmark href="/" />

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button asChild>
            <Link href="/login?mode=login">Sign in</Link>
          </Button>
          <Button asChild variant="primary" className="hidden sm:inline-flex">
            <Link href="/login?mode=signup">
              Sign up
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </nav>

      <div className="mx-auto max-w-6xl px-6 pb-8 pt-16 md:pt-24">
        <div className="mx-auto max-w-3xl text-center">
          <FadeInUp>
            {/* A number is a better badge than a glyph (§6). */}
            <p className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
              Spaced repetition · SM-2 · AI card generation
            </p>
          </FadeInUp>

          <FadeInUp delay={0.06}>
            <h1 className="mt-5 font-serif text-[clamp(4.125rem,7.5vw,6.75rem)] font-medium leading-[1.0] tracking-[-0.025em] text-balance text-ink">
              Study smarter,
              <br />
              remember forever
            </h1>
          </FadeInUp>

          <FadeInUp delay={0.12}>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
              Turn a PDF into flashcards in about thirty seconds, then let the
              scheduler decide when you see each one again.
            </p>
          </FadeInUp>

          <FadeInUp delay={0.18}>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              {/* The page's one filled button (§7.2). */}
              <Button asChild variant="primary" size="lg" className="w-full px-8 text-base sm:w-auto">
                <Link href="/login?mode=signup">
                  Start free
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild size="lg" className="w-full px-8 text-base sm:w-auto">
                <Link href="/login?mode=login">Sign in</Link>
              </Button>
            </div>
          </FadeInUp>
        </div>

        {/* ── Product specimen ── */}
        <FadeInUp delay={0.24} className="mx-auto mt-16 max-w-4xl">
          <div className="surface overflow-hidden">
            <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-3">
              <span className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
                cognit.app/dashboard
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                Search <Kbd>⌘K</Kbd>
              </span>
            </div>

            <div className="p-5 sm:p-7">
              <p className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
                Due now
              </p>
              <p
                className="mt-2 font-mono text-[52px] font-semibold leading-none tracking-[-0.04em] tnum"
                style={{ color: 'var(--state-due)' }}
              >
                10
              </p>
              <p className="mt-3 text-sm text-muted-foreground">
                across <span className="font-mono tnum text-ink-dim">2</span> decks · about{' '}
                <span className="font-mono tnum text-ink-dim">4</span> min
              </p>

              <div className="mt-7 border-t border-border">
                <div className="flex items-center gap-3 border-b border-border py-2 font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
                  <span className="w-[2px] shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1">Deck</span>
                  <span className="w-14 text-right">Cards</span>
                  <span className="w-12 text-right">Due</span>
                  <span className="w-16 text-right">Mastery</span>
                </div>

                {SPECIMEN_DECKS.map((deck) => (
                  <div key={deck.name} className="flex items-center gap-3 border-b border-border py-2.5">
                    <span
                      aria-hidden="true"
                      className="h-4 w-[2px] shrink-0 rounded-[1px]"
                      style={{ backgroundColor: deck.state }}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">{deck.name}</span>
                    <span className="w-14 text-right font-mono text-[13px] tnum text-ink-dim">
                      {deck.cards}
                    </span>
                    <span
                      className="w-12 text-right font-mono text-[13px] tnum"
                      style={{ color: deck.due > 0 ? 'var(--state-due)' : 'var(--ink-dimmer)' }}
                    >
                      {deck.due}
                    </span>
                    <span className="w-16 text-right font-mono text-[13px] tnum text-ink-dim">
                      {deck.mastery}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </FadeInUp>
      </div>
    </section>
  );
}
