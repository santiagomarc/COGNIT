'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/Kbd';
import type { ForecastDay } from '@/lib/dashboard-forecast';

const WEEKDAY = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' });

type DueNowBandProps = {
  totalDue: number;
  /** Decks with at least one card due, most due first. */
  dueDecks: { deckId: string; deckTitle: string; dueCount: number }[];
  /** Whole days since the oldest overdue card came due; null when clear. */
  oldestOverdueDays: number | null;
  estimatedMinutes: number;
  /** Where "start session" goes. Null when the account has no decks at all. */
  sessionHref: string | null;
  /** The seven days after today. See `buildSevenDayForecast`. */
  forecastDays: ForecastDay[];
};

/** How many decks the by-deck list names before it summarises. */
const NAMED_DECKS = 3;

/**
 * The dashboard's primary band — the one `.raised` object on the screen
 * (Run 6, Task 2.2).
 *
 * Three readings, in the order a user actually asks for them: how much is due
 * now, when the rest arrives, and where it is. The middle one used to be a
 * full-width section of its own two scroll-lengths further down, and the third
 * was a horizontally-scrolling chip run that was unreadable at nine due decks.
 *
 * "Import PDF" is gone from this page entirely — it belongs to a deck, and the
 * deck page already has it.
 */
export function DueNowBand({
  totalDue,
  dueDecks,
  oldestOverdueDays,
  estimatedMinutes,
  sessionHref,
  forecastDays,
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
  const named = dueDecks.slice(0, NAMED_DECKS);
  const remaining = dueDecks.slice(NAMED_DECKS);
  const remainingDue = remaining.reduce((sum, deck) => sum + deck.dueCount, 0);

  const forecastTotal = forecastDays.reduce((sum, day) => sum + day.count, 0);
  const forecastPeak = Math.max(1, ...forecastDays.map((day) => day.count));

  return (
    <section className="raised spec flex flex-col p-4 md:px-[22px] md:py-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          {/* The one hero figure on the screen. */}
          <p
            className="shrink-0 font-mono text-[44px] font-semibold leading-[0.86] tracking-[-0.045em] tnum md:text-[52px]"
            style={{ color: hasWork ? 'var(--state-due)' : 'var(--ink)' }}
          >
            {totalDue}
          </p>

          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">
              {hasWork ? (
                <>
                  cards due across <span className="font-mono tnum">{dueDecks.length}</span>{' '}
                  {deckWord}
                </>
              ) : (
                'All caught up'
              )}
            </p>
            <p className="mt-0.5 truncate text-xs text-ink-dim">
              {hasWork ? (
                <>
                  {oldestOverdueDays !== null && oldestOverdueDays > 0 ? (
                    <>
                      oldest is <span className="font-mono tnum">{oldestOverdueDays}</span> days
                      overdue ·{' '}
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

        {/* The dashboard's one filled button (§7.2). */}
        {sessionHref ? (
          <Button asChild variant="primary" size="lg" className="shrink-0 gap-2 max-sm:w-full">
            <Link href={sessionHref}>
              {hasWork ? 'Start session' : 'Study ahead'}
              <Kbd>S</Kbd>
            </Link>
          </Button>
        ) : null}
      </div>

      {forecastDays.length > 0 || dueDecks.length > 0 ? (
        <>
          <div className="rule rule--soft my-3.5" />

          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-7">
            {/*
              The seven days AFTER today. Today is the hero figure two inches
              above; at 519 due it would be ~4.6x the tallest projected column
              and flatten every other bar to a stub (see buildSevenDayForecast).
            */}
            {forecastDays.length > 0 ? (
              <div className="w-full lg:w-[400px] lg:shrink-0">
                <p className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
                  Next 7 days · <span className="tnum text-ink">{forecastTotal}</span> cards
                </p>
                <div className="mt-2 grid grid-flow-col auto-cols-fr items-end gap-2">
                  {forecastDays.map((day) => {
                    const heightPercent =
                      day.count === 0 ? 0 : Math.max(6, (day.count / forecastPeak) * 100);

                    return (
                      <div key={day.date} className="flex flex-col items-center gap-[5px]">
                        <span className="font-mono text-[13px] leading-none tnum text-ink-dim max-sm:hidden">
                          {day.count}
                        </span>
                        {/* Capped width: a bar stretched across a seventh of the
                            band stops reading as a bar and starts reading as a slab. */}
                        <span
                          className="flex h-[52px] w-full max-w-[30px] items-end"
                          aria-hidden="true"
                        >
                          <span
                            className="block w-full rounded-t-[3px] bg-border-strong"
                            style={{ height: `${heightPercent}%` }}
                          />
                        </span>
                        <span className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
                          <span className="sr-only">
                            {day.count} cards on{' '}
                          </span>
                          {WEEKDAY.format(new Date(`${day.date}T00:00:00Z`))}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {forecastDays.length > 0 && dueDecks.length > 0 ? (
              <div className="rule--v max-lg:hidden" aria-hidden="true" />
            ) : null}

            {dueDecks.length > 0 ? (
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
                  Due now, by deck
                </p>
                <ul className="mt-2 flex flex-col gap-[5px]">
                  {named.map((deck) => (
                    <li key={deck.deckId}>
                      <Link
                        href={`/dashboard/${deck.deckId}/study`}
                        className="group flex items-baseline gap-3 rounded-[var(--radius-sm)] outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                      >
                        <span className="min-w-0 flex-1 truncate text-[13px] text-ink-dim group-hover:text-ink">
                          {deck.deckTitle}
                        </span>
                        <span
                          className="font-mono text-[13px] tnum"
                          style={{ color: 'var(--state-due)' }}
                        >
                          {deck.dueCount}
                        </span>
                      </Link>
                    </li>
                  ))}
                  {remaining.length > 0 ? (
                    <li className="flex items-baseline gap-3">
                      <span className="flex-1 text-xs text-ink-dimmer">
                        + {remaining.length} more {remaining.length === 1 ? 'deck' : 'decks'}
                      </span>
                      <span className="font-mono text-xs tnum text-ink-dimmer">{remainingDue}</span>
                    </li>
                  ) : null}
                </ul>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
