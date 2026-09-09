import { ActivityHeatmap } from './ActivityHeatmap';

type StudyStreakCardProps = {
  streak: number;
  longestStreak: number;
  studiedToday: boolean;
  totalStudiedCards: number;
  todayStudiedCount: number;
  todayIso: string;
  activity: { date: string; count: number }[];
  /** Share of quiz-assessed cards answered correctly; null with no quiz data. */
  retentionPercentage: number | null;
  assessedCards: number;
};

const DAILY_GOAL = 20;
const SPARK_DAYS = 30;

/**
 * Builds the last `SPARK_DAYS` of review counts, gaps included.
 *
 * A sparkline drawn only from days that have entries lies: a week off shows as
 * a flat line rather than a hole.
 */
function buildRecentSeries(activity: { date: string; count: number }[], todayIso: string) {
  const byDate = new Map(activity.map((entry) => [entry.date, entry.count]));
  const today = new Date(`${todayIso}T00:00:00Z`);
  const anchor = Number.isNaN(today.getTime()) ? new Date() : today;

  const series: { date: string; count: number }[] = [];
  for (let offset = SPARK_DAYS - 1; offset >= 0; offset -= 1) {
    const day = new Date(anchor);
    day.setUTCDate(day.getUTCDate() - offset);
    const iso = day.toISOString().slice(0, 10);
    series.push({ date: iso, count: byDate.get(iso) ?? 0 });
  }
  return series;
}

/**
 * The two retrospective panels, demoted below the deck index (Phase 6.5).
 *
 * They sat in the top band taking two-thirds of it, which put the least
 * actionable thing on the page above the most actionable one (defect F-06).
 * Retention and a streak report what already happened; nothing here is a task.
 *
 * This is a server component now — the old version was `'use client'` only to
 * run a repeating flame-scale animation and two width springs, none of which
 * survived §5's "instruments do not bounce".
 */
export function StudyStreakCard({
  streak,
  longestStreak,
  studiedToday,
  totalStudiedCards,
  todayStudiedCount,
  todayIso,
  activity,
  retentionPercentage,
  assessedCards,
}: StudyStreakCardProps) {
  const series = buildRecentSeries(activity, todayIso);
  const peak = Math.max(1, ...series.map((point) => point.count));
  const dailyGoalProgress = Math.min(100, Math.round((todayStudiedCount / DAILY_GOAL) * 100));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* ── Recall ── */}
      <section className="surface min-w-0 p-5 md:p-6">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
            Recall accuracy
          </h2>
          <p className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] tnum text-ink-dimmer">
            {assessedCards} assessed
          </p>
        </div>

        <p className="mt-3 font-mono text-[34px] font-semibold leading-none tracking-[-0.03em] tnum">
          {retentionPercentage === null ? '—' : `${retentionPercentage}%`}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {retentionPercentage === null
            ? 'Take a quiz to start measuring recall.'
            : 'Share of quiz-assessed cards answered correctly.'}
        </p>

        {/* Reviews over the last 30 days. Bars, not a curve: the underlying
            series is a count per day, and a smoothed line would invent values
            between them. */}
        <div className="mt-5">
          <div className="flex h-10 items-end gap-[2px]" aria-hidden="true">
            {series.map((point) => (
              <span
                key={point.date}
                className="block flex-1 rounded-[1px]"
                style={{
                  height: point.count === 0 ? '1px' : `${Math.max(8, (point.count / peak) * 100)}%`,
                  backgroundColor: point.count === 0 ? 'var(--border)' : 'var(--ink-dim)',
                }}
              />
            ))}
          </div>
          <p className="mt-2 font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
            Reviews · last <span className="tnum">{SPARK_DAYS}</span> days · peak{' '}
            <span className="tnum">{peak}</span>
          </p>
        </div>
      </section>

      {/* ── Streak ── */}
      <section className="surface min-w-0 p-5 md:p-6">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
            Streak
          </h2>
          <p className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
            {studiedToday ? 'Logged today' : 'Not logged today'}
          </p>
        </div>

        <p
          className="mt-3 font-mono text-[34px] font-semibold leading-none tracking-[-0.03em] tnum"
          style={{ color: streak > 0 ? 'var(--state-streak)' : 'var(--ink)' }}
        >
          {streak}d
        </p>

        <dl className="mt-4 grid grid-cols-3 gap-4 border-t border-border pt-4">
          <div>
            <dt className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
              Longest
            </dt>
            <dd className="mt-1 font-mono text-[15px] tnum text-ink">{longestStreak}d</dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
              Today
            </dt>
            <dd className="mt-1 font-mono text-[15px] tnum text-ink">
              {todayStudiedCount}/{DAILY_GOAL}
            </dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
              All time
            </dt>
            <dd className="mt-1 font-mono text-[15px] tnum text-ink">{totalStudiedCards}</dd>
          </div>
        </dl>

        <div className="mt-4">
          <div className="h-[3px] w-full bg-border" aria-hidden="true">
            <div
              className="h-full"
              style={{
                width: `${dailyGoalProgress}%`,
                backgroundColor:
                  dailyGoalProgress >= 100 ? 'var(--state-mastered)' : 'var(--ink-dim)',
              }}
            />
          </div>
          <p className="mt-2 font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
            Daily goal <span className="tnum">{dailyGoalProgress}%</span>
          </p>
        </div>

        {/* Six months of day cells has a min-content width wider than a phone.
            It scrolls inside its own box rather than stretching the grid track
            and taking the whole page sideways with it. */}
        <div className="mt-5 overflow-x-auto border-t border-border pt-4">
          <ActivityHeatmap activity={activity} monthsToShow={6} anchorDate={todayIso} />
        </div>
      </section>
    </div>
  );
}
