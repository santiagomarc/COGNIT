import Link from 'next/link';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { StateTick } from '@/components/ui/shared/StateTick';
import { loadSynthesisInsights, type SynthesisInsights } from '@/lib/synthesis/loaders';
import { FORMAT_LABEL, VERDICT_LABEL, VERDICT_TICK, formatAge, formatClock } from '@/lib/synthesis/ui';

const LABEL = 'font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer';

// Both panels render under their own Suspense boundary; `cache` makes the
// second one reuse the first's reads within the request.
const loadForCurrentUser = cache(async (deckId: string): Promise<SynthesisInsights | null> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  return loadSynthesisInsights(supabase, { deckId, userId: user.id });
});

/**
 * "Weak links" (spec §8.5): per card, how often a link citing it went missing
 * and how often a verified contradiction named it. The shape of
 * `WeakestConcepts`: rows of type with numbers right-aligned; the only hue is
 * `--state-lapsed` on a contradiction count above zero.
 */
export async function WeakLinks({ deckId }: { deckId: string }) {
  const insights = await loadForCurrentUser(deckId);
  if (!insights || insights.attemptCount === 0) return null;

  return (
    <section className="surface p-5 md:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className={LABEL}>Weak links</h2>
        <p className={`${LABEL} tnum`}>
          Outside claims 30d <span className="text-ink">{insights.outsideClaims30d}</span>
        </p>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Cards whose links went missing or were contradicted in your drills.
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
