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
    <section className="surface p-6 md:p-7">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
            Due now
          </p>

          {/* The `metric` step (§3.3): the one big number on the dashboard. */}
          <p
            className="mt-2 font-mono text-[52px] font-semibold leading-none tracking-[-0.04em] tnum"
            style={{ color: hasWork ? 'var(--state-due)' : 'var(--ink)' }}
          >
            {totalDue}
          </p>

          <p className="mt-3 text-sm text-muted-foreground">
            {hasWork ? (
              <>
                across <span className="font-mono tnum text-ink-dim">{dueDecks.length}</span>{' '}
                {deckWord}
                {oldestOverdueDays !== null && oldestOverdueDays > 0 ? (
                  <>
                    {' · oldest overdue '}
                    <span className="font-mono tnum text-ink-dim">{oldestOverdueDays}d</span>
                  </>
                ) : null}
                {' · about '}
                <span className="font-mono tnum text-ink-dim">{estimatedMinutes}</span> min
              </>
            ) : (
              'Nothing is due. Study ahead, or come back when the scheduler brings cards round.'
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* The dashboard's one filled button (§7.2). */}
          {sessionHref ? (
            <Button asChild variant="primary" className="gap-2">
              <Link href={sessionHref}>
                {hasWork ? 'Start session' : 'Study ahead'}
                <Kbd>S</Kbd>
              </Link>
            </Button>
          ) : null}

          {/*
            * The create-deck dialog is mounted by the shell layout now, so this
            * is a trigger rather than the dialog itself — which is also why the
            * onboarding panel can open it when this band is not rendered.
            */}
          <Button type="button" onClick={requestOpenCreateDeck} aria-haspopup="dialog">
            New deck
          </Button>

          {importHref ? (
            <Button asChild>
              <Link href={importHref}>Import PDF</Link>
            </Button>
          ) : null}
        </div>
      </div>

      {hasWork && dueDecks.length > 0 ? (
        <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 border-t border-border pt-4">
          {dueDecks.slice(0, 6).map((deck) => (
            <li key={deck.deckId}>
              <Link
                href={`/dashboard/${deck.deckId}/study`}
                className="group inline-flex items-baseline gap-2 rounded-[var(--radius-control)] text-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                <span className="max-w-[14rem] truncate text-ink-dim group-hover:text-ink">
                  {deck.deckTitle}
                </span>
                <span className="font-mono text-[13px] tnum" style={{ color: 'var(--state-due)' }}>
                  {deck.dueCount}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
