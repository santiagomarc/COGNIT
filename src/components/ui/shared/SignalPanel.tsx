import { ActivityHeatmap } from '@/components/ui/shared/ActivityHeatmap';

export type SignalPanelProps = {
  retentionPercentage: number | null;
  assessedCards: number;
  streak: number;
  longestStreak: number;
  studiedToday: boolean;
  activity: { date: string; count: number }[];
  todayIso: string;
  totalStudiedCards: number;
};

const SPARK_BARS = 20;
const STREAK_WINDOW = 28;

function buildRecentSeries(
  activity: { date: string; count: number }[],
  todayIso: string,
  days: number
) {
  const byDate = new Map(activity.map((entry) => [entry.date, entry.count]));
  const parsed = new Date(`${todayIso}T00:00:00Z`);
  const anchor = Number.isNaN(parsed.getTime()) ? new Date() : parsed;

  const series: { date: string; count: number }[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = new Date(anchor);
    day.setUTCDate(day.getUTCDate() - offset);
    series.push({ date: day.toISOString().slice(0, 10), count: byDate.get(day.toISOString().slice(0, 10)) ?? 0 });
  }
  return series;
}

/**
 * The dashboard's instrument panel — activity, recall and streak in one
 * divided container (Run 6, Task 2.4).
 *
 * **This is what puts the heatmap above the fold.** It used to be the last
 * item in a single left column, below the due band, twelve deck rows and the
 * forecast — roughly two screens down on a real account, which is why the
 * owner had never seen it. Two of these three readings were also in a 320px
 * right rail that cost the deck table a fifth of its width, at deck names like
 * "Data Structures & Algorithms" where that width is not spare.
 *
 * They are one container split by two rules rather than three cards on
 * purpose: three cards read as three unrelated things, and these are three
 * readings of the same subject.
 */
export function SignalPanel({
  retentionPercentage,
  assessedCards,
  streak,
  longestStreak,
  studiedToday,
  activity,
  todayIso,
  totalStudiedCards,
}: SignalPanelProps) {
  const spark = buildRecentSeries(activity, todayIso, SPARK_BARS);
  const sparkPeak = Math.max(1, ...spark.map((point) => point.count));
  const days = buildRecentSeries(activity, todayIso, STREAK_WINDOW);

  return (
    <section className="surface spec flex flex-col items-stretch p-4 xl:flex-row xl:px-5 xl:pb-3 xl:pt-3.5">
      {/* ── Activity ─────────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col xl:pr-[22px]">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h2 className="type-label text-ink-dimmer">
            Activity · 6 months
          </h2>
          <p className="type-label text-ink-dimmer">
            <span className="tnum text-ink">{totalStudiedCards}</span> {totalStudiedCards === 1 ? 'review' : 'reviews'} all time
          </p>
        </div>

        <div className="mt-2.5">
          <ActivityHeatmap activity={activity} monthsToShow={6} anchorDate={todayIso} />
        </div>
      </div>

      <div className="rule rule--soft my-4 xl:hidden" aria-hidden="true" />
      <div className="rule--v max-xl:hidden" aria-hidden="true" />

      {/* ── Quiz-proven ──────────────────────────────────────────── */}
      <div className="flex flex-col xl:w-[238px] xl:shrink-0 xl:px-[22px]">
        <h2 className="type-label text-ink-dimmer">
          Quiz-proven
        </h2>

        <p className="mt-2.5 type-readout-sm font-semibold leading-none tracking-[-0.03em] text-ink">
          {retentionPercentage === null ? '—' : `${retentionPercentage}%`}
        </p>
        <p className="mt-1.5 type-cap text-ink">
          <span className="font-mono tnum">{assessedCards}</span> {assessedCards === 1 ? 'card' : 'cards'} assessed
        </p>
        {/* Plain text, not a tooltip: it has to work by keyboard and by touch. */}
        <p className="mt-1 type-cap text-ink-dim">
          {assessedCards > 0
            ? 'Share of the cards you’ve been quizzed on whose last quiz answer was correct.'
            : 'Take a quiz to see the share of cards you answer correctly.'}
        </p>

        <div className="mt-3 flex h-[34px] items-end gap-[2px]" aria-hidden="true">
          {spark.map((point) => {
            const hasActivity = point.count > 0;
            return (
              <span
                key={point.date}
                className="block flex-1 rounded-t-[2px]"
                style={{
                  height: hasActivity ? `${Math.max(14, (point.count / sparkPeak) * 100)}%` : '2px',
                  backgroundColor: hasActivity ? 'var(--heat-ramp-4)' : 'var(--heat-ramp-1)',
                }}
              />
            );
          })}
        </div>
      </div>

      <div className="rule rule--soft my-4 xl:hidden" aria-hidden="true" />
      <div className="rule--v max-xl:hidden" aria-hidden="true" />

      {/* ── Session streak ───────────────────────────────────────────── */}
      <div className="flex flex-col xl:w-[238px] xl:shrink-0 xl:pl-[22px]">
        <h2 className="type-label text-ink-dimmer">
          Session streak
        </h2>

        <div className="mt-2.5 flex items-baseline gap-2">
          <p
            className="type-readout-sm font-semibold leading-none tracking-[-0.03em]"
            style={{ color: streak > 0 ? 'var(--state-streak)' : 'var(--ink)' }}
          >
            {streak}
          </p>
          <span className="font-mono text-xs text-ink-dimmer">
            {streak === 1 ? 'day' : 'days'} · best <span className="tnum text-ink-dim">{longestStreak}</span>
          </span>
        </div>
        <p className="mt-1.5 type-cap text-ink-dim">
          {studiedToday ? 'Logged today' : 'Not logged today'}
        </p>

        {/*
          28 days, not 14. A 14-cell strip at a 14-day streak is entirely lit
          and communicates nothing — a run only means something against the
          misses around it.
        */}
        <ul className="mt-3.5 flex gap-[3px]" aria-label={`Last ${STREAK_WINDOW} days of activity`}>
          {days.map((day, index) => {
            const active = day.count > 0;
            const isToday = index === days.length - 1;
            return (
              <li
                key={day.date}
                className="h-5 flex-1 rounded-[2px]"
                title={`${day.date}: ${active ? `${day.count} reviewed` : 'no reviews'}`}
                style={{
                  backgroundColor: active
                    ? isToday
                      ? 'var(--heat-ramp-4)'
                      : 'var(--heat-ramp-3)'
                    : 'var(--heat-ramp-0)',
                  border: active ? 'none' : '1px solid var(--heat-ramp-1)',
                }}
              />
            );
          })}
        </ul>

        {/* Today's cell is distinguished by colour AND by position, which the
            end labels make explicit — colour is never the sole carrier. */}
        <div className="flex items-baseline justify-between pt-2 type-label text-ink-dimmer">
          <span>{STREAK_WINDOW}d ago</span>
          <span>Today</span>
        </div>
      </div>
    </section>
  );
}
