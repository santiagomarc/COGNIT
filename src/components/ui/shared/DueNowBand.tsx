'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/Kbd';
import { requestOpenCreateDeck } from '@/lib/dashboard-events';

type DueNowBandProps = {
  totalDue: number;
  /** Decks with at least one card due, most due first. */
  dueDecks: { deckId: string; deckTitle: string; dueCount: number }[];
  /** Whole days since the oldest overdue card came due; null when clear. */
  oldestOverdueDays: number | null;
  estimatedMinutes: number;
  /** Where "start session" goes. Null when the account has no decks at all. */
  sessionHref: string | null;
  /** Most recently updated deck, for the PDF import shortcut. */
  importHref: string | null;
};

/**
 * The dashboard's top band (defect F-06).
 *
 * The layout this replaces sized "create a deck" — the single most important
 * entry point for a new user — as five-twelfths of a stats column, while the
 * retrospective streak card took two-thirds of the band. The weight is now
 * inverted: what is due takes the full width, gets the one big number in the
 * product (§3.3 `metric`), and carries the screen's only filled button.
 */
export function DueNowBand({
  totalDue,
  dueDecks,
  oldestOverdueDays,
  estimatedMinutes,
  sessionHref,
  importHref,
}: DueNowBandProps) {
  const router = useRouter();
  const hasWork = totalDue > 0;

  /*
   * `S` starts a session (§7.3). The keycap beside the button is only honest if
   * the binding exists, so it is implemented here rather than drawn.
   */
  useEffect(() => {
    if (!sessionHref) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement ||
        (event.target instanceof HTMLElement && event.target.isContentEditable)
      ) {
        return;
      }

      // Never steal a browser or OS chord.
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key.toLowerCase() !== 's') return;

      event.preventDefault();
      router.push(sessionHref);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [router, sessionHref]);

  const deckWord = dueDecks.length === 1 ? 'deck' : 'decks';

  return (
    <section className="surface surface--raised p-5 md:px-6 md:py-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4 min-w-0">
          {/* The metric step (§3.3) */}
          <p
            className="font-mono text-[44px] font-semibold leading-none tracking-[-0.04em] tnum shrink-0"
            style={{ color: hasWork ? 'var(--state-due)' : 'var(--ink)' }}
          >
            {totalDue}
          </p>

          <div className="min-w-0">
            <p className="text-sm font-medium text-ink truncate">
              {hasWork ? (
                <>
                  cards due across <span className="font-mono tnum">{dueDecks.length}</span> {deckWord}
                </>
              ) : (
                'All caught up'
              )}
            </p>
            <p className="mt-0.5 text-xs text-ink-dim truncate">
              {hasWork ? (
                <>
                  {oldestOverdueDays !== null && oldestOverdueDays > 0 ? (
                    <>
                      oldest is <span className="font-mono tnum">{oldestOverdueDays} days</span> overdue ·{' '}
                    </>
                  ) : null}
                  est. <span className="font-mono tnum">{estimatedMinutes}</span> min
                </>
              ) : (
                'No reviews scheduled. Study ahead or add new material.'
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button type="button" onClick={requestOpenCreateDeck} aria-haspopup="dialog">
            New deck
          </Button>

          {importHref ? (
            <Button asChild>
              <Link href={importHref}>Import PDF</Link>
            </Button>
          ) : null}

          {/* The dashboard's one filled button (§7.2). */}
          {sessionHref ? (
            <Button asChild variant="primary" className="gap-2">
              <Link href={sessionHref}>
                {hasWork ? 'Start session' : 'Study ahead'}
                <Kbd>S</Kbd>
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      {hasWork && dueDecks.length > 0 ? (
        <div className="mt-4 flex items-center gap-x-4 overflow-x-auto border-t border-border pt-3 text-xs whitespace-nowrap scrollbar-none">
          {dueDecks.slice(0, 5).map((deck) => (
            <Link
              key={deck.deckId}
              href={`/dashboard/${deck.deckId}/study`}
              className="group inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            >
              <span className="max-w-[13rem] truncate text-ink-dim group-hover:text-ink">
                {deck.deckTitle}
              </span>
              <span className="font-mono text-[12px] tnum" style={{ color: 'var(--state-due)' }}>
                {deck.dueCount}
              </span>
            </Link>
          ))}
          {dueDecks.length > 5 ? (
            <span className="font-mono text-[11px] text-ink-dimmer">
              +{dueDecks.length - 5} more
            </span>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
