import type { RetentionWeek } from '@/lib/analytics';
import { ChartDataTable } from '@/components/ui/shared/analytics/ChartDataTable';

const WEEK_LABEL = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const LABEL = 'font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer';

/** The drawing box. The SVG stretches to the panel, so these are proportions, not pixels. */
const WIDTH = 400;
const HEIGHT = 110;
const TARGET = 0.85;

function weekLabel(weekStart: string): string {
  return WEEK_LABEL.format(new Date(`${weekStart}T00:00:00Z`));
}

/**
 * Weekly true retention over the window: a line of pass rate over bars of
 * review count. Retention is a reading, not an SM-2 state, so the line is
 * ink; the 85 % target is a hairline for reference (§2.2).
 *
 * Geometry stretches with the panel; type does not (plan §5.3, MOB-02). The
 * SVG holds only the bars, the line and the hairline — non-scaling strokes,
 * so a wide panel does not fatten them — while the labels are HTML at the
 * 10 px label step and the dots are HTML spans, because a stretched
 * `<circle>` becomes an ellipse. The picture is aria-hidden; the numbers
 * are in a real table.
 */
export function RetentionTrend({ weeks }: { weeks: RetentionWeek[] }) {
  const series = [...weeks].sort((a, b) => a.week_start.localeCompare(b.week_start)).slice(-16);
  const rated = series.filter((week) => week.pass_rate !== null);

  if (rated.length < 2) {
    return (
      <p className="mt-3 text-[13px] text-ink-dim">
        The trend needs two weeks of reviews on cards that have reached the review state.
      </p>
    );
  }

  const peakReviews = Math.max(1, ...series.map((week) => week.reviews));
  const step = WIDTH / Math.max(1, series.length);
  const x = (index: number) => index * step + step / 2;
  const y = (rate: number) => HEIGHT - rate * HEIGHT;

  // A week with no rated reviews breaks the line: it must not claim continuity it does not have.
  const path = series
    .map((week, index) => (week.pass_rate === null ? null : `${x(index).toFixed(1)},${y(week.pass_rate).toFixed(1)}`))
    .reduce<string[]>((segments, point, index) => {
      if (point === null) return segments;
      const previous = series[index - 1];
      const connect = index > 0 && previous?.pass_rate !== null && segments.length > 0;
      segments.push(`${connect ? 'L' : 'M'}${point}`);
      return segments;
    }, [])
    .join(' ');

  const first = series[0];
  const last = series[series.length - 1];
  const firstRate = Math.round((rated[0].pass_rate ?? 0) * 100);
  const lastRate = Math.round((rated[rated.length - 1].pass_rate ?? 0) * 100);

  return (
    <figure className="mt-3">
      <div className="relative h-[110px] w-full" aria-hidden="true">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          {series.map((week, index) => {
            const barHeight = week.reviews === 0 ? 0 : Math.max(2, (week.reviews / peakReviews) * HEIGHT * 0.6);
            return (
              <rect
                key={week.week_start}
                x={x(index) - step * 0.3}
                y={HEIGHT - barHeight}
                width={step * 0.6}
                height={barHeight}
                fill="var(--border)"
              />
            );
          })}
          <line
            x1={0}
            x2={WIDTH}
            y1={y(TARGET)}
            y2={y(TARGET)}
            stroke="var(--border-strong)"
            strokeDasharray="3 4"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={path}
            fill="none"
            stroke="var(--ink)"
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {series.map((week, index) => (
          week.pass_rate === null ? null : (
            <span
              key={week.week_start}
              className="absolute block h-[5px] w-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--ink)]"
              style={{ left: `${(x(index) / WIDTH) * 100}%`, top: `${(y(week.pass_rate) / HEIGHT) * 100}%` }}
            />
          )
        ))}
        <span className={`absolute right-0 -translate-y-full pb-0.5 ${LABEL}`} style={{ top: `${(y(TARGET) / HEIGHT) * 100}%` }}>
          85% target
        </span>
      </div>
      <div className={`mt-1 flex justify-between tnum ${LABEL}`} aria-hidden="true">
        <span>{weekLabel(first.week_start)}</span>
        <span>{weekLabel(last.week_start)}</span>
      </div>
      <ChartDataTable
        caption={`Weekly retention over ${rated.length} weeks, from ${firstRate} percent to ${lastRate} percent; target 85 percent.`}
        columns={['Week of', 'Reviews', 'Retained']}
        rows={series.map((week) => [
          weekLabel(week.week_start),
          week.reviews,
          week.pass_rate === null ? 'no rated reviews' : `${Math.round(week.pass_rate * 100)}%`,
        ])}
      />
    </figure>
  );
}
