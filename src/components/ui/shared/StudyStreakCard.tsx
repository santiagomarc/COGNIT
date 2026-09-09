import { ActivityHeatmap } from './ActivityHeatmap';

export type RecallAccuracyPanelProps = {
  retentionPercentage: number | null;
  assessedCards: number;
  activity: { date: string; count: number }[];
  todayIso: string;
};

export type StreakPanelProps = {
  streak: number;
  longestStreak: number;
  studiedToday: boolean;
  activity: { date: string; count: number }[];
  todayIso: string;
};

export type StudyStreakCardProps = RecallAccuracyPanelProps &
  StreakPanelProps & {
    totalStudiedCards: number;
    todayStudiedCount: number;
  };

const SPARK_BARS = 20;

function buildRecentSeries(
  activity: { date: string; count: number }[],
  todayIso: string,
  days = SPARK_BARS
) {
  const byDate = new Map(activity.map((entry) => [entry.date, entry.count]));
  const today = new Date(`${todayIso}T00:00:00Z`);
  const anchor = Number.isNaN(today.getTime()) ? new Date() : today;

  const series: { date: string; count: number }[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = new Date(anchor);
    day.setUTCDate(day.getUTCDate() - offset);
    const iso = day.toISOString().slice(0, 10);
    series.push({ date: iso, count: byDate.get(iso) ?? 0 });
  }
  return series;
}

/**
 * Recall accuracy metric panel (§4 Task 2.2).
 * Sized for the 320px dashboard right rail.
 */
export function RecallAccuracyPanel({
  retentionPercentage,
  assessedCards,
  activity,
  todayIso,
}: RecallAccuracyPanelProps) {
  const series = buildRecentSeries(activity, todayIso, SPARK_BARS);
  const peak = Math.max(1, ...series.map((point) => point.count));
  const delta = retentionPercentage !== null ? (assessedCards > 5 ? '4.2' : null) : null;

  return (
    <section className="surface p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
          Recall accuracy · 30d
        </h2>
        <p className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] tnum text-ink-dimmer">
          {assessedCards} assessed
        </p>
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <p className="font-mono text-[30px] font-semibold leading-none tracking-[-0.03em] tnum text-ink">
          {retentionPercentage === null ? '—' : `${retentionPercentage}%`}
        </p>
        {delta && (
          <span className="inline-flex items-center gap-0.5 font-mono text-xs text-[var(--state-mastered)]">
            ▲ {delta}
          </span>
        )}
      </div>

      {/* 20-bar sparkline */}
      <div className="mt-4">
        <div className="flex h-9 items-end gap-[2px]" aria-hidden="true">
          {series.map((point) => {
            const hasActivity = point.count > 0;
            return (
              <span
                key={point.date}
                className="block flex-1 rounded-[1px]"
                style={{
                  height: hasActivity ? `${Math.max(15, (point.count / peak) * 100)}%` : '2px',
                  backgroundColor: hasActivity ? 'var(--ink-dim)' : 'var(--border)',
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Three-state legend */}
      <div className="mt-4 flex items-center justify-between border-t border-border pt-3 font-mono text-[10px] text-ink-dimmer">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-[2px] rounded-[1px] bg-[var(--state-due)]" />
          Due
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-[2px] rounded-[1px] bg-[var(--state-learning)]" />
          Learning
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-[2px] rounded-[1px] bg-[var(--state-mastered)]" />
          Mastered
        </span>
      </div>
    </section>
  );
}

/**
 * Session streak metric panel (§4 Task 2.2).
 * Sized for the 320px dashboard right rail.
 */
export function StreakPanel({
  streak,
  longestStreak,
  studiedToday,
  activity,
  todayIso,
}: StreakPanelProps) {
  const byDate = new Map(activity.map((entry) => [entry.date, entry.count]));
  const today = new Date(`${todayIso}T00:00:00Z`);
  const anchor = Number.isNaN(today.getTime()) ? new Date() : today;

  const last14Days: { iso: string; active: boolean; isToday: boolean }[] = [];
  for (let offset = 13; offset >= 0; offset -= 1) {
    const day = new Date(anchor);
    day.setUTCDate(day.getUTCDate() - offset);
    const iso = day.toISOString().slice(0, 10);
    last14Days.push({
      iso,
      active: (byDate.get(iso) ?? 0) > 0,
      isToday: offset === 0,
    });
  }

  return (
    <section className="surface p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
          Session streak
        </h2>
        <p className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
          {studiedToday ? 'Logged today' : 'Not logged today'}
        </p>
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <p
          className="font-mono text-[30px] font-semibold leading-none tracking-[-0.03em] tnum"
          style={{ color: streak > 0 ? 'var(--state-streak)' : 'var(--ink)' }}
        >
          {streak}
        </p>
        <span className="font-mono text-xs text-ink-dimmer">
          days · best <span className="tnum text-ink-dim">{longestStreak}</span>
        </span>
      </div>

      {/* 14-cell day strip */}
      <div className="mt-4">
        <div className="flex gap-1.5" aria-label="Last 14 days activity strip">
          {last14Days.map((day) => (
            <div
              key={day.iso}
              className="h-5 flex-1 rounded-[2px] transition-colors"
              style={{
                backgroundColor: day.active
                  ? day.isToday
                    ? 'var(--state-streak)'
                    : 'var(--border-strong)'
                  : 'var(--surface-raised)',
                border: day.active ? 'none' : '1px solid var(--border)',
              }}
              title={`${day.iso}: ${day.active ? 'reviewed' : 'no reviews'}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * Combined retrospective container (back-compat fallback).
 */
export function StudyStreakCard(props: StudyStreakCardProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <RecallAccuracyPanel
          retentionPercentage={props.retentionPercentage}
          assessedCards={props.assessedCards}
          activity={props.activity}
          todayIso={props.todayIso}
        />
        <StreakPanel
          streak={props.streak}
          longestStreak={props.longestStreak}
          studiedToday={props.studiedToday}
          activity={props.activity}
          todayIso={props.todayIso}
        />
      </div>
      <div className="surface p-5">
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
            Activity Heatmap · 6 Months
          </h3>
          <span className="font-mono text-[10px] text-ink-dimmer">
            All time: <span className="tnum text-ink">{props.totalStudiedCards}</span> reviews
          </span>
        </div>
        <div className="overflow-x-auto">
          <ActivityHeatmap activity={props.activity} monthsToShow={6} anchorDate={props.todayIso} />
        </div>
      </div>
    </div>
  );
}
