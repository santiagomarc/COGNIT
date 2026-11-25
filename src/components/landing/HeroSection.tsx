
'use client';

import Link, { useLinkStatus } from 'next/link';
import { ArrowRight, Loader2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Wordmark } from '@/components/ui/shared/Wordmark';
import { FadeInUp } from '@/components/motion';

/*
 * Preserve the original CTA navigation feedback.
 */
function CtaBody({
  children,
  icon,
}: {
  children: ReactNode;
  icon?: ReactNode;
}) {
  const { pending } = useLinkStatus();

  return (
    <>
      <span className={pending ? 'opacity-70' : undefined}>
        {children}
      </span>
      {pending ? (
        <span
          className="inline-flex animate-in fade-in fill-mode-both delay-100"
          aria-hidden="true"
        >
          <Loader2 className="h-4 w-4 animate-spin" />
        </span>
      ) : (
        icon
      )}
    </>
  );
}

/*
 * Sticky landing header.
 * Transparent at the top of the page.
 * Uses the existing background color while scrolling
 * to prevent headings from showing through the links.
 *
 * Render this above HeroSection in page.tsx.
 */
export function LandingHeader() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const updateScroll = () => {
      setScrolled(window.scrollY > 20);
    };

    updateScroll();

    window.addEventListener('scroll', updateScroll, {
      passive: true,
    });

    return () => {
      window.removeEventListener('scroll', updateScroll);
    };
  }, []);

  const navLink =
    'inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg px-3 py-2 font-mono text-sm font-medium text-ink-dim transition-colors duration-200 hover:bg-surface-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]';

  return (
    <header
      className={`sticky top-0 z-50 w-full transition-colors duration-200 ${
        scrolled
          ? 'bg-[var(--bg)]/95 backdrop-blur-xl'
          : 'bg-transparent'
      }`}
    >
      <nav
        aria-label="Main navigation"
        className="mx-auto grid max-w-6xl grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 px-6 py-5 lg:grid-cols-[1fr_auto_auto] lg:gap-x-6"
      >
        {/* Original Cognit wordmark */}
        <div className="min-w-0 justify-self-start">
          <Wordmark href="/" size="md" />
        </div>

        {/* Navigation links */}
        <div className="order-3 col-span-2 flex min-w-0 items-center gap-2 overflow-x-auto whitespace-nowrap lg:order-none lg:col-span-1 lg:col-start-2 lg:gap-4 lg:overflow-visible">

          <a href="#how-it-works" className={navLink}>
            How It Works
          </a>

          <a href="#features" className={navLink}>
            Features
          </a>

          <Link
            href="/login?mode=login"
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg px-4 py-2 font-mono text-sm font-medium text-ink transition-colors duration-200 hover:bg-surface-raised hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            Sign In
          </Link>

          <Link
            href="/login?mode=signup"
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-3 rounded-xl border border-[#B7410E] bg-[#B7410E] px-6 py-2 text-sm font-semibold text-white shadow-sm transition-colors duration-200 hover:border-[#C44C15] hover:bg-[#C44C15] hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            Sign Up
            <ArrowRight
              className="h-4 w-4"
              aria-hidden="true"
            />
          </Link>

        </div>

        {/* Existing theme toggle */}
        <div className="justify-self-end lg:col-start-3 lg:row-start-1">
          <ThemeToggle />
        </div>
      </nav>
    </header>
  );
}

/*
 * Landing hero.
 * Original typography and existing theme colors retained.
 * No background or dashboard changes are made here.
 */
export function HeroSection() {
  return (
    <section className="relative">
      <div className="mx-auto flex min-h-[76svh] max-w-6xl flex-col justify-center px-6 pb-16 pt-8">

        <div className="mx-auto w-full max-w-3xl text-center">

          <FadeInUp>
            <p className="font-mono type-cap uppercase leading-[1.5] tracking-[0.16em] text-ink-dim">
              Spaced repetition · SM-2 · AI Flashcard Generator
            </p>
          </FadeInUp>

          {/* EXACT ORIGINAL COGNIT HEADLINE STYLING */}
          <FadeInUp delay={0.06}>
            <h1 className="mt-5 font-serif type-hero leading-[1.0] tracking-[-0.025em] text-balance text-ink">
              Study smarter,
              <br />
              remember forever
            </h1>
          </FadeInUp>

          <FadeInUp delay={0.12}>
            <p className="mx-auto mt-8 max-w-xl font-mono text-[15px] leading-relaxed text-ink">
              Turn a PDF into flashcards, then let SM-2 schedule every review.
            </p>
          </FadeInUp>

          {/* Figma-inspired action layout, existing Cognit colors */}
          <FadeInUp delay={0.18}>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">

              <Button
                asChild
                variant="primary"
                size="lg"
                className="w-full px-8 text-base sm:w-auto border-[#B7410E]! bg-[#B7410E]! text-white! hover:border-[#C44C15]! hover:bg-[#C44C15]!"
              >
                <Link href="/login?mode=signup">
                  <CtaBody
                    icon={
                      <ArrowRight
                        className="h-4 w-4"
                        aria-hidden="true"
                      />
                    }
                  >
                    Sign Up
                  </CtaBody>
                </Link>
              </Button>

              <a
                href="#how-it-works"
                className="inline-flex min-h-11 w-full items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border-control)] px-8 py-2 text-base font-medium text-ink transition-colors duration-200 hover:border-[var(--border-strong)] hover:bg-surface-raised hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] sm:w-auto"
              >
                See How It Works
              </a>

            </div>
          </FadeInUp>

        </div>
      </div>
    </section>
  );
}
