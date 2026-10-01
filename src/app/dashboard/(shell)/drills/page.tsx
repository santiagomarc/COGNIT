import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { StateTick } from '@/components/ui/shared/StateTick';
import { removeDeckTagFromTitle } from '@/lib/deck-tags';
import { logger } from '@/lib/logger';
import { drillSessionHref } from '@/lib/synthesis/links';
import { daysToExam, examLine } from '@/lib/synthesis/schedule';
import { getDueDrills, getRequestClient, getRequestNow, getSessionUser } from '@/lib/supabase/session';

export const metadata: Metadata = {
  title: 'Drills - Cognit',
};

const LABEL = 'font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer';
const LINK =
  'rounded-[var(--radius-sm)] outline-hidden hover:underline hover:underline-offset-[3px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]';

type DueDeck = { deckId: string; title: string; dueCount: number; examAt: string | null };

/**
 * Every deck with drills due, in one place (sidebar plan §4.2, DST-01).
 *
 * Until now the only cross-deck view of drills was one line in Today's due
 * band, which led to the single deck with the most. This page lists them all.
 *
 * Planes (design system §1b): the deck with the most due is the one `.raised`
 * launcher, because starting it is what the page is for; the rest sit in a
 * `.well`. Exam dates are time, not memory (§2.2e), so they stay in ink.
 */
export default async function DrillsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const [supabase, drills] = await Promise.all([getRequestClient(), getDueDrills(user.id)]);
  const now = getRequestNow();

  const dueIds = drills.decks.map((deck) => deck.deckId);
  let decks: DueDeck[] = [];

  if (dueIds.length > 0) {
    // RLS and the trash policy apply, exactly as on Today: a trashed deck's drills never get here.
    const { data, error } = await supabase.from('decks').select('id, title, exam_at').in('id', dueIds);
    if (error) logger.error('drills', 'deck read failed', { message: error.message });

    const byId = new Map((data ?? []).map((deck) => [deck.id, deck]));
    decks = drills.decks.flatMap((row) => {
      const deck = byId.get(row.deckId);
      return deck
        ? [{ deckId: row.deckId, title: removeDeckTagFromTitle(deck.title), dueCount: row.dueCount, examAt: deck.exam_at }]
        : [];
    });
  }

  const [next, ...rest] = decks;
  const total = decks.reduce((sum, deck) => sum + deck.dueCount, 0);
  const totalLabel = drills.truncated ? `${total}+` : String(total);

  return (
    <div className="container mx-auto flex flex-col gap-4 p-4 md:px-8 md:py-6">
      <header>
        <p className={LABEL}>Synthesis</p>
        <h1 className="mt-1 font-serif type-display leading-[1.08] tracking-[-0.02em] text-ink">Drills</h1>
        <p className="mt-1.5 text-[13px] text-ink-dim">
          {next ? (
            <>
              <span className="font-mono tnum text-ink">{totalLabel}</span> {total === 1 ? 'drill' : 'drills'} due across{' '}
              <span className="font-mono tnum text-ink">{decks.length}</span> {decks.length === 1 ? 'deck' : 'decks'}
            </>
          ) : (
            'Nothing due right now.'
          )}
        </p>
      </header>

      {next ? (
        <section
          className="raised spec flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between md:px-[22px] md:py-4"
          aria-labelledby="drills-next"
        >
          <div className="min-w-0">
            <h2 id="drills-next" className={LABEL}>Next up</h2>
            <p className="mt-1 truncate text-base font-medium text-ink">
              <Link href={`/dashboard/${next.deckId}`} className={LINK}>
                {next.title}
              </Link>
            </p>
            <p className="mt-0.5 text-[13px] text-ink-dim">
              <span className="font-mono tnum" style={{ color: 'var(--state-due)' }}>{next.dueCount}</span> due
              {next.examAt ? (
                <>
                  {' · '}
                  <span className="text-ink">{examLine(daysToExam(next.examAt, now))}</span>
                </>
              ) : null}
            </p>
          </div>

          {/* The page's one filled button (§7.2). */}
          <Button asChild variant="primary" size="lg" className="shrink-0 gap-2 max-sm:w-full">
            <Link href={drillSessionHref(next.deckId, next.dueCount)}>
              Start drills
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </section>
      ) : (
        <section className="well px-4 py-8 text-center" aria-labelledby="drills-empty">
          <h2 id="drills-empty" className="text-sm font-medium text-ink">No drills due.</h2>
          <p className="mx-auto mt-1 max-w-md text-[13px] text-ink-dim">
            Drills are written from a deck&rsquo;s cards. Open a deck and start them from its Overview.
          </p>
          <Link href="/dashboard" className={`mt-3 inline-block text-[13px] text-ink underline underline-offset-[3px] ${LINK}`}>
            Back to Today
          </Link>
        </section>
      )}

      {rest.length > 0 ? (
        <section aria-labelledby="drills-more">
          <h2 id="drills-more" className={LABEL}>Also due</h2>
          <ul className="well mt-2 px-3.5">
            {rest.map((deck) => (
              <li
                key={deck.deckId}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border py-2.5 last:border-b-0"
              >
                <StateTick state="due" />
                <Link href={`/dashboard/${deck.deckId}`} className={`min-w-0 flex-1 truncate text-sm text-ink ${LINK}`}>
                  {deck.title}
                </Link>
                {deck.examAt ? (
                  <span className="text-[12px] text-ink">{examLine(daysToExam(deck.examAt, now))}</span>
                ) : null}
                <span className="font-mono text-[13px] tnum" style={{ color: 'var(--state-due)' }}>
                  {deck.dueCount}
                  <span className="sr-only"> drills due</span>
                </span>
                <Button asChild variant="default" size="sm">
                  <Link href={drillSessionHref(deck.deckId, deck.dueCount)} aria-label={`Start drills in ${deck.title}`}>
                    Start
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
