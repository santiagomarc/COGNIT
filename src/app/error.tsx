'use client';

import { useEffect } from 'react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { logger } from '@/lib/logger';

/**
 * Application error boundary (design system §9.4).
 *
 * Three things changed. The panel was a translucent card with a `rounded-3xl`
 * corner and an inline `{ type: 'spring', stiffness: 260 }` entrance — a
 * spring on the one screen where the user is already unsettled. The
 * `<AlertTriangle/>` in a tinted box was carrying no information the heading
 * did not already carry, and its red was a fourth use of hue outside the state
 * channel. And the copy apologised ("Don't worry — your data is safe") rather
 * than saying what to do.
 *
 * `console.error` is now the project logger, so an error on this path is
 * scoped and structured like every other one.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error('app', 'unhandled render error', {
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12">
      <div className="w-full max-w-lg">
        <p
          className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em]"
          style={{ color: 'var(--state-lapsed)' }}
        >
          Error
        </p>

        <h1 className="mt-3 text-2xl font-semibold tracking-[-.025em] text-ink">
          This page failed to load
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          The error has been logged. Retrying usually works — if it does not, the
          problem is on our side rather than with anything you did.
        </p>

        {error.digest ? (
          <p className="mt-5 border-t border-border pt-4 font-mono text-xs text-ink-dimmer">
            Reference <span className="text-ink-dim">{error.digest}</span> — quote this if you
            report it.
          </p>
        ) : null}

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button onClick={reset} variant="primary">
            Try again
          </Button>
          <Button asChild>
            <Link href="/dashboard">Go to your decks</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
