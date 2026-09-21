import Link from 'next/link';
import { cache } from 'react';
import { getRequestClient, getSessionUser } from '@/lib/supabase/session';
import { Button } from '@/components/ui/button';
import { StateTick } from '@/components/ui/shared/StateTick';
import { MAX_SESSION_CARD_COUNT } from '@/lib/study';
import { loadSynthesisInsights, type SynthesisInsights } from '@/lib/synthesis/loaders';
import { FORMAT_LABEL, MISCONCEPTION_LABEL, VERDICT_LABEL, VERDICT_TICK, formatAge, formatClock } from '@/lib/synthesis/ui';
import { MISCONCEPTION_KINDS } from '@/lib/synthesis/types';

const LABEL = 'font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer';

// Both panels render under their own Suspense boundary; `cache` makes the
// second one reuse the first's reads within the request — and the client and
// identity come from the request-wide cache, so this adds no auth call of its own.
const loadForCurrentUser = cache(async (deckId: string): Promise<SynthesisInsights | null> => {
  const [supabase, user] = await Promise.all([getRequestClient(), getSessionUser()]);
  if (!user) return null;
  return loadSynthesisInsights(supabase, { deckId, userId: user.id });
});

/**
 * "Weak links" (spec §8.5): per card, how often a link citing it went missing
 * and how often a verified contradiction named it. The shape of
 * `WeakestConcepts`: rows of type with numbers right-aligned; the only hue is
 * `--state-lapsed` on a contradiction count above zero. The panel has one
 * action (audit U5): review exactly these cards.
 */
export async function WeakLinks({ deckId }: { deckId: string }) {
  const insights = await loadForCurrentUser(deckId);
  if (!insights || insights.attemptCount === 0) return null;

  const weakCardIds = insights.weakLinks.slice(0, MAX_SESSION_CARD_COUNT).map((row) => row.cardId);

  return (
    <section className="surface p-5 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className={LABEL}>Weak links</h2>
        <p className={`${LABEL} tnum`}>
          Outside claims 30d <span className="text-ink">{insights.outsideClaims30d}</span>
          {insights.calibration30d !== null ? (
            <>
              {' · '}Calibration 30d <span className="text-ink">{Math.round(insights.calibration30d * 100)}%</span>
            </>
          ) : null}
        </p>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Cards whose links went missing or were contradicted in your drills.
        {insights.calibration30d !== null ? ' Calibration is how often your confidence matched the verdict.' : null}
      </p>

      {insights.weakLinks.length === 0 ? (
        <p className="mt-4 border-t border-border pt-4 text-[13px] text-ink-dim">
          No weak links yet — every card has fewer than two signals.
        </p>
      ) : (
        <div className="mt-4 border-t border-border">
          {insights.weakLinks.map((row) => (
            <div key={row.cardId} className="flex items-center gap-4 border-b border-border py-2.5 last:border-b-0">
              <span className="min-w-0 flex-1 truncate text-sm text-ink">{row.term}</span>
              <span className="w-20 shrink-0 text-right font-mono text-[13px] tnum text-ink-dim">
                {row.missing} <span className="text-ink-dimmer">missing</span>
              </span>
              <span
                className="w-24 shrink-0 text-right font-mono text-[13px] tnum"
                style={{ color: row.contradicted > 0 ? 'var(--state-lapsed)' : 'var(--ink-dim)' }}
              >
                {row.contradicted} <span className="text-ink-dimmer">contra</span>
              </span>
              <span className="hidden w-12 shrink-0 text-right font-mono text-[13px] tnum text-ink-dimmer sm:block">
                {formatAge(row.lastAt)}
              </span>
            </div>
          ))}
        </div>
      )}

      {weakCardIds.length > 0 ? (
        <div className="mt-4 flex justify-end">
          <Button asChild variant="default" size="sm">
            <Link href={`/dashboard/${deckId}/study?cards=${weakCardIds.join(',')}`}>
              Review these {weakCardIds.length} {weakCardIds.length === 1 ? 'card' : 'cards'}
            </Link>
          </Button>
        </div>
      ) : null}
    </section>
  );
}

/** The deck's recent attempts, newest first; each row reopens its drill. */
export async function DrillHistory({ deckId }: { deckId: string }) {
  const insights = await loadForCurrentUser(deckId);
  if (!insights || insights.history.length === 0) return null;

  return (
    <section className="surface p-5 md:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className={LABEL}>Drill history</h2>
        <p className={`${LABEL} tnum`}>{insights.attemptCount} attempts</p>
      </div>

      <ul className="mt-4 border-t border-border">
        {insights.history.map((row) => (
          <li key={row.attemptId} className="flex items-center gap-3 border-b border-border py-2.5 last:border-b-0">
            <StateTick state={VERDICT_TICK[row.verdict]} />
            <span className="w-24 shrink-0 font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dim">
              {VERDICT_LABEL[row.verdict]}
            </span>
            <span className="w-10 shrink-0 font-mono text-[13px] tnum text-ink">
              {row.linksCovered}/{row.linksTotal}
            </span>
            <Link
              href={`/dashboard/${deckId}/synthesis?drill=${row.drillId}&count=1`}
              className="min-w-0 flex-1 truncate text-sm text-ink underline-offset-[3px] outline-hidden hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            >
              {row.promptText}
            </Link>
            <span className="hidden shrink-0 font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer md:block">
              {FORMAT_LABEL[row.format]}
            </span>
            <span className="hidden w-12 shrink-0 text-right font-mono text-[13px] tnum text-ink-dimmer sm:block">
              {formatClock(row.durationMs)}
            </span>
            <span className="w-10 shrink-0 text-right font-mono text-[13px] tnum text-ink-dimmer">
              {formatAge(row.createdAt)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The signals a tutor would look at (audit U6, G7): which kinds of question
 * the student can already answer, what kind of mistake they make, and
 * whether links covered per day is climbing. One `.surface`, three rows;
 * the sparkline is inline SVG in the deck-row rhythm.
 */
export async function DrillSignals({ deckId }: { deckId: string }) {
  const insights = await loadForCurrentUser(deckId);
  if (!insights || insights.attemptCount === 0) return null;

  const daily = insights.daily;
  const width = 240;
  const height = 36;
  const points = daily.map((point, index) => {
    const x = daily.length > 1 ? (index / (daily.length - 1)) * width : 0;
    const share = point.linksTotal > 0 ? point.linksCovered / point.linksTotal : null;
    return { x, y: share === null ? null : height - share * (height - 4) - 2, attempts: point.attempts };
  });
  const path = points
    .filter((point): point is { x: number; y: number; attempts: number } => point.y !== null)
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join(' ');
  const activeDays = daily.filter((point) => point.attempts > 0).length;
  const kinds = MISCONCEPTION_KINDS.map((kind) => ({ kind, count: insights.misconceptions30d[kind] ?? 0 })).filter((entry) => entry.count > 0);

  return (
    <section className="surface p-5 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className={LABEL}>Drill signals</h2>
        <p className={`${LABEL} tnum`}>{activeDays} active {activeDays === 1 ? 'day' : 'days'} · 30d</p>
      </div>

      {/* Links covered per day: the climb, not the number. */}
      <div className="mt-3 flex items-end gap-4">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-9 w-full max-w-[240px]" role="img" aria-label="Share of links covered per day over the last 30 days">
          <line x1="0" y1={height - 2} x2={width} y2={height - 2} stroke="var(--border)" strokeWidth="1" />
          {path ? <path d={path} fill="none" stroke="var(--ink-dim)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" /> : null}
          {points.map((point, index) => (point.y !== null ? <circle key={index} cx={point.x} cy={point.y} r="1.5" fill="var(--ink)" /> : null))}
        </svg>
        <span className={`${LABEL} tnum shrink-0`}>Links covered / day</span>
      </div>

      {insights.formatRates.length > 0 ? (
        <div className="mt-4 border-t border-border">
          {insights.formatRates.map((row) => (
            <div key={row.format} className="flex items-center gap-4 border-b border-border py-2 last:border-b-0">
              <span className="min-w-0 flex-1 text-sm text-ink">{FORMAT_LABEL[row.format]}</span>
              <span className="w-24 shrink-0 text-right font-mono text-[13px] tnum text-ink-dim">
                {row.attempts} <span className="text-ink-dimmer">{row.attempts === 1 ? 'attempt' : 'attempts'}</span>
              </span>
              <span
                className="w-20 shrink-0 text-right font-mono text-[13px] tnum"
                style={{ color: row.attempts > 0 && row.sound / row.attempts >= 0.7 ? 'var(--state-mastered)' : 'var(--ink-dim)' }}
              >
                {Math.round((row.sound / Math.max(1, row.attempts)) * 100)}% <span className="text-ink-dimmer">sound</span>
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {kinds.length > 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className={LABEL}>Mistakes 30d</span>
          {kinds.map((entry) => (
            <span key={entry.kind} className="flex items-center gap-1.5 text-[13px] text-ink">
              <span className="font-mono tnum" style={{ color: 'var(--state-lapsed)' }}>{entry.count}</span>
              <span className="text-ink-dim">{MISCONCEPTION_LABEL[entry.kind]}</span>
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function SynthesisInsightsSkeleton() {
  return (
    <section className="surface p-5 md:p-6">
      <div className="glass-skeleton h-3 w-28 rounded-sm" />
      <div className="mt-4 space-y-3 border-t border-border pt-4">
        <div className="glass-skeleton h-4 w-full rounded-sm" />
        <div className="glass-skeleton h-4 w-full rounded-sm" />
      </div>
    </section>
  );
}
