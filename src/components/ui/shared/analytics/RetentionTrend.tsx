import type { RetentionWeek } from '@/lib/analytics';

const WEEK_LABEL = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/**
 * Weekly true retention over the window: a line of pass rate over bars of
 * review count. Retention is a reading, not an SM-2 state, so the line is
 * ink; the 85 % target is a hairline for reference (§2.2).
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

  const width = 400;
  const height = 110;
  const peakReviews = Math.max(1, ...series.map((week) => week.reviews));
  const step = width / Math.max(1, series.length);
  const x = (index: number) => index * step + step / 2;
  const y = (rate: number) => height - rate * height;

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

  return (
    <figure className="mt-3">
      <svg
        viewBox={`0 0 ${width} ${height + 18}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Weekly retention over ${rated.length} weeks, from ${Math.round((rated[0].pass_rate ?? 0) * 100)} percent to ${Math.round((rated[rated.length - 1].pass_rate ?? 0) * 100)} percent.`}
      >
        {series.map((week, index) => {
          const barHeight = week.reviews === 0 ? 0 : Math.max(2, (week.reviews / peakReviews) * height * 0.6);
          return (
            <rect
              key={week.week_start}
              x={x(index) - step * 0.3}
              y={height - barHeight}
              width={step * 0.6}
              height={barHeight}
              rx={1.5}
              fill="var(--border)"
            >
              <title>{`Week of ${WEEK_LABEL.format(new Date(`${week.week_start}T00:00:00Z`))}: ${week.reviews} reviews${week.pass_rate === null ? '' : `, ${Math.round(week.pass_rate * 100)}% retained`}`}</title>
            </rect>
          );
        })}
        <line x1={0} x2={width} y1={y(0.85)} y2={y(0.85)} stroke="var(--border-strong)" strokeDasharray="3 4" />
        <text x={width} y={y(0.85) - 3} textAnchor="end" className="fill-[var(--ink-dimmer)] font-mono text-[9px] uppercase tracking-[0.12em]">
          85% target
        </text>
        <path d={path} fill="none" stroke="var(--ink)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
        {series.map((week, index) => (
          week.pass_rate === null ? null : (
            <circle key={week.week_start} cx={x(index)} cy={y(week.pass_rate)} r={2.5} fill="var(--ink)" />
          )
        ))}
        <text x={x(0)} y={height + 13} textAnchor="start" className="fill-[var(--ink-dimmer)] font-mono text-[9px] uppercase tracking-[0.12em]">
          {WEEK_LABEL.format(new Date(`${first.week_start}T00:00:00Z`))}
        </text>
        <text x={x(series.length - 1)} y={height + 13} textAnchor="end" className="fill-[var(--ink-dimmer)] font-mono text-[9px] uppercase tracking-[0.12em]">
          {WEEK_LABEL.format(new Date(`${last.week_start}T00:00:00Z`))}
        </text>
      </svg>
    </figure>
  );
}
