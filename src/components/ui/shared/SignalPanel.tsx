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
    <section className="surface spec flex flex-col items-stretch p-4 lg:flex-row lg:px-5 lg:pb-3 lg:pt-3.5">
      {/* ── Activity ─────────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col lg:pr-[22px]">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
            Activity · 6 months
          </h2>
          <p className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
            <span className="tnum text-ink">{totalStudiedCards}</span> reviews all time
          </p>
        </div>

        <div className="mt-2.5 overflow-x-auto">
          <ActivityHeatmap activity={activity} monthsToShow={6} anchorDate={todayIso} />
        </div>
      </div>

      <div className="rule rule--soft my-4 lg:hidden" aria-hidden="true" />
      <div className="rule--v max-lg:hidden" aria-hidden="true" />

      {/* ── Recall accuracy ──────────────────────────────────────────── */}
      <div className="flex flex-col lg:w-[238px] lg:shrink-0 lg:px-[22px]">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
            Recall accuracy · 30d
          </h2>
          <p className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] tnum text-ink-dimmer">
            {assessedCards} assessed
          </p>
        </div>

        <p className="mt-2.5 font-mono text-[32px] font-semibold leading-none tracking-[-0.03em] tnum text-ink">
          {retentionPercentage === null ? '—' : `${retentionPercentage}%`}
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
                  backgroundColor: hasActivity ? 'var(--ink-dim)' : 'var(--border)',
                }}
              />
            );
          })}
        </div>

        {/* Every state swatch is paired with its word. The state channel's
            due/learning pair measures ΔE 0.6 under deuteranopia in light mode,
            so §2.3's "colour is never alone" rule is load-bearing here, not
            decorative — do not reduce this to bare ticks. */}
        <div className="mt-auto flex items-center justify-between gap-2 pt-3 font-mono text-[10px] text-ink-dimmer">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-[2px] rounded-[1px] bg-[var(--state-due)]" aria-hidden="true" />
            Due
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-[2px] rounded-[1px] bg-[var(--state-learning)]" aria-hidden="true" />
            Learning
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-[2px] rounded-[1px] bg-[var(--state-mastered)]" aria-hidden="true" />
            Mastered
          </span>
        </div>
      </div>

      <div className="rule rule--soft my-4 lg:hidden" aria-hidden="true" />
      <div className="rule--v max-lg:hidden" aria-hidden="true" />

      {/* ── Session streak ───────────────────────────────────────────── */}
      <div className="flex flex-col lg:w-[238px] lg:shrink-0 lg:pl-[22px]">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
            Session streak
          </h2>
          <p className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
            {studiedToday ? 'Logged today' : 'Not logged today'}
          </p>
        </div>

        <div className="mt-2.5 flex items-baseline gap-2">
          <p
            className="font-mono text-[32px] font-semibold leading-none tracking-[-0.03em] tnum"
            style={{ color: streak > 0 ? 'var(--state-streak)' : 'var(--ink)' }}
          >
            {streak}
          </p>
          <span className="font-mono text-xs text-ink-dimmer">
            days · best <span className="tnum text-ink-dim">{longestStreak}</span>
          </span>
        </div>

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
                      ? 'var(--state-streak)'
                      : 'var(--border-strong)'
                    : 'var(--surface-raised)',
                  border: active ? 'none' : '1px solid var(--border)',
                }}
              />
            );
          })}
        </ul>

        {/* Today's cell is distinguished by colour AND by position, which the
            end labels make explicit — colour is never the sole carrier. */}
        <div className="mt-auto flex items-baseline justify-between pt-2.5 font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
          <span>{STREAK_WINDOW}d ago</span>
          <span>Today</span>
        </div>
      </div>
    </section>
  );
}
