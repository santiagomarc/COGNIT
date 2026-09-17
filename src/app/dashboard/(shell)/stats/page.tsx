import Link from 'next/link';
import { redirect } from 'next/navigation';

import { ActivityHeatmap } from '@/components/ui/shared/ActivityHeatmap';
import { Telemetry } from '@/components/ui/shared/Telemetry';
import { LoadForecast } from '@/components/ui/shared/analytics/LoadForecast';
import { RetentionTrend } from '@/components/ui/shared/analytics/RetentionTrend';
import { RetrievabilityHistogram } from '@/components/ui/shared/analytics/RetrievabilityHistogram';
import { TopicHeatmap } from '@/components/ui/shared/analytics/TopicHeatmap';
import {
  intervalBands,
  loadSeries,
  parseAnalyticsSnapshot,
  recentRetention,
  retrievabilityHistogram,
  type AnalyticsSnapshot,
} from '@/lib/analytics';
import { logger } from '@/lib/logger';
import { getRequestClient, getRequestNow, getSessionUser } from '@/lib/supabase/session';

const WINDOW_DAYS = 90;

const LABEL = 'font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer';

const BAND_LABEL: Record<string, string> = {
  new: 'Never studied',
  learning: 'In learning steps',
  '1-6d': 'Interval under a week',
  '7-29d': 'One to four weeks',
  '30-89d': 'One to three months',
  '90d+': 'Three months and beyond',
};

/**
 * The Analytics Hub (improvement plan §4.1) — `/dashboard/stats`.
 *
 * One RPC, parsed strictly, rendered by four SVG components and the existing
 * heatmap. The order is the order a student asks the questions: how well am
 * I retaining, what is about to slip, what is coming, where am I weak, how
 * much have I been doing, and what does the collection look like.
 *
 * Plane assignment (§8): one `.raised` object — the forecast, the reading
 * that changes what the student does next — flat `.surface` panels for the
 * rest, and a `.well` for the two tables.
 */
export default async function StatsPage() {
  const [supabase, user] = await Promise.all([getRequestClient(), getSessionUser()]);
  if (!user) {
    redirect('/login');
  }

  const now = getRequestNow();
  const { data, error } = await supabase.rpc('get_analytics_snapshot', {
    p_now: now.toISOString(),
    p_days: WINDOW_DAYS,
  });

  let snapshot: AnalyticsSnapshot | null = null;
  if (error) {
    logger.error('stats', 'get_analytics_snapshot rpc failed', { message: error.message });
  } else {
    snapshot = parseAnalyticsSnapshot(data);
    if (!snapshot) {
      logger.error('stats', 'get_analytics_snapshot returned an unexpected shape');
    }
  }

  if (!snapshot) {
    return (
      <div className="container mx-auto flex flex-col gap-4 p-4 md:px-8 md:py-6">
        <header>
          <p className={LABEL}>Analytics</p>
          <h1 className="mt-1 font-serif type-display leading-[1.08] tracking-[-0.02em] text-ink">Statistics</h1>
        </header>
        <p className="surface p-5 text-sm text-ink-dim">
          Statistics are unavailable right now. Retry in a moment; your reviews are recorded either way.
        </p>
      </div>
    );
  }

  const hasHistory = snapshot.totals.reviews_in_window > 0 || snapshot.totals.review_state > 0;
  const retention30 = recentRetention(snapshot.retention_weekly, 4);
  const retentionPct = retention30 === null ? null : Math.round(retention30 * 100);
  const recallNow = snapshot.totals.mean_r_now === null ? null : Math.round(snapshot.totals.mean_r_now * 100);
  const bars = retrievabilityHistogram(snapshot);
  const load = loadSeries(snapshot.load_30d, now);
  const bands = intervalBands(snapshot);
  const effort = snapshot.effort.map((day) => ({ date: day.day, count: day.reviews }));
  const minutes = snapshot.effort.reduce((sum, day) => sum + day.minutes, 0);
  const todayIso = now.toISOString().slice(0, 10);
  const atRiskHref = snapshot.totals.at_risk_deck_id ? `/dashboard/${snapshot.totals.at_risk_deck_id}/study?scope=due` : null;

  return (
    <div className="container mx-auto flex flex-col gap-4 p-4 md:px-8 md:py-6">
      {/* ═══ Header — the three readings that summarise everything below ═══ */}
      <header className="flex flex-col gap-y-4 lg:flex-row lg:items-end lg:justify-between lg:gap-x-10">
        <div className="min-w-0">
          <p className={LABEL}>Analytics · last {WINDOW_DAYS} days</p>
          <h1 className="mt-1 font-serif type-display leading-[1.08] tracking-[-0.02em] text-ink">Statistics</h1>
        </div>

        {/* Retention is a reading and stays ink; "at risk" is a state and may take the due hue (§2.2). */}
        <div className="flex shrink-0 flex-wrap items-baseline gap-x-6 gap-y-3 lg:pb-1">
          <Telemetry label="Retention · 30d" value={retentionPct === null ? '—' : `${retentionPct}%`} />
          <Telemetry label="Predicted recall" value={recallNow === null ? '—' : `${recallNow}%`} />
          <Telemetry
            label="At risk"
            value={snapshot.totals.at_risk_now}
            tone={snapshot.totals.at_risk_now > 0 ? 'due' : 'ink'}
          />
          <Telemetry label="Cards" value={snapshot.totals.cards} />
        </div>
      </header>

      {!hasHistory ? (
        <section className="surface p-5">
          <h2 className={LABEL}>Not enough history yet</h2>
          <p className="mt-2 max-w-xl text-sm text-ink-dim">
            Study for a week and this page fills in: the forgetting-curve forecast, the review load ahead,
            retention by week and by topic. Every review is already being recorded.
          </p>
          <Link
            href="/dashboard"
            className="mt-3 inline-block rounded-[var(--radius-sm)] text-sm text-ink underline underline-offset-[3px] outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            Back to your decks
          </Link>
        </section>
      ) : null}

      {/* ═══ Forecast — the one raised object ══════════════════════════ */}
      <section className="raised spec p-4 md:px-[22px] md:py-[18px]" aria-labelledby="forecast-heading">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="forecast-heading" className={LABEL}>Forgetting curve · predicted recall now</h2>
          <p className={`${LABEL} tnum`}>{snapshot.totals.review_state} reviewed cards</p>
        </div>
        <RetrievabilityHistogram bars={bars} />
        {snapshot.totals.at_risk_now > 0 ? (
          <p className="mt-3 text-[13px] text-ink">
            <span className="font-mono tnum" style={{ color: 'var(--state-due)' }}>{snapshot.totals.at_risk_now}</span>{' '}
            {snapshot.totals.at_risk_now === 1 ? 'card is' : 'cards are'} below 80% predicted recall.
            {atRiskHref ? (
              <>
                {' '}
                <Link
                  href={atRiskHref}
                  className="rounded-[var(--radius-sm)] underline underline-offset-[3px] outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                >
                  Review the deck with the most →
                </Link>
              </>
            ) : null}
          </p>
        ) : null}
      </section>

      {/* ═══ Load and trend ════════════════════════════════════════════ */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="surface p-4 lg:p-5" aria-labelledby="load-heading">
          <h2 id="load-heading" className={LABEL}>Review load · next 30 days</h2>
          <LoadForecast days={load} />
        </section>

        <section className="surface p-4 lg:p-5" aria-labelledby="trend-heading">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="trend-heading" className={LABEL}>True retention · by week</h2>
            <p className={`${LABEL} tnum`}>review-state grades ≥ 3</p>
          </div>
          <RetentionTrend weeks={snapshot.retention_weekly} />
        </section>
      </div>

      {/* ═══ Topic mastery ═════════════════════════════════════════════ */}
      <section aria-labelledby="topics-heading">
        <div className="flex items-center gap-3.5 pb-2.5">
          <h2 id="topics-heading" className={`shrink-0 ${LABEL}`}>Topic mastery</h2>
          <span className="rule flex-1" aria-hidden="true" />
          <span className={`shrink-0 ${LABEL} tnum`}>{snapshot.topic_mastery.length} topics</span>
        </div>
        <TopicHeatmap topics={snapshot.topic_mastery} />
      </section>

      {/* ═══ Effort ════════════════════════════════════════════════════ */}
      <section className="surface p-4 lg:p-5" aria-labelledby="effort-heading">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="effort-heading" className={LABEL}>Effort · last {WINDOW_DAYS} days</h2>
          <p className={`${LABEL} tnum`}>
            <span className="text-ink">{snapshot.totals.reviews_in_window}</span> reviews ·{' '}
            <span className="text-ink">{Math.round(minutes)}</span> min
          </p>
        </div>
        <div className="mt-2.5 overflow-x-auto">
          <ActivityHeatmap activity={effort} monthsToShow={3} anchorDate={todayIso} />
        </div>
      </section>

      {/* ═══ Collection ════════════════════════════════════════════════ */}
      <section aria-labelledby="collection-heading">
        <div className="flex items-center gap-3.5 pb-2.5">
          <h2 id="collection-heading" className={`shrink-0 ${LABEL}`}>Collection by interval</h2>
          <span className="rule flex-1" aria-hidden="true" />
          <span className={`shrink-0 ${LABEL} tnum`}>{snapshot.totals.cards} cards</span>
        </div>
        <ul className="well overflow-hidden px-3.5">
          {bands.map((band) => (
            <li key={band.band} className="flex items-center gap-3 border-b border-border py-2.5 last:border-b-0">
              <span className="w-14 shrink-0 font-mono text-[13px] tnum text-ink">{band.band}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-ink-dim">{BAND_LABEL[band.band]}</span>
              <span className="hidden h-[6px] w-32 overflow-hidden rounded-[2px] bg-[var(--border)] sm:block" aria-hidden="true">
                <span className="block h-full rounded-[2px] bg-[var(--ink-dim)]" style={{ width: `${Math.round(band.share * 100)}%` }} />
              </span>
              <span className="w-12 shrink-0 text-right font-mono text-[13px] tnum text-ink-dim">{band.cards}</span>
              <span className="w-12 shrink-0 text-right font-mono text-[13px] tnum text-ink-dimmer">{Math.round(band.share * 100)}%</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
