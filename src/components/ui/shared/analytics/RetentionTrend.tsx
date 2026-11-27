import type { RetentionWeek } from '@/lib/analytics';
import { ChartDataTable } from '@/components/ui/shared/analytics/ChartDataTable';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

function formatDate(date: string) {
  return DATE_FORMAT.format(
    new Date(`${date}T00:00:00Z`)
  );
}

type Point = {
  x: number;
  y: number;
  date: string;
  rate: number;
  reviews: number;
};

export function RetentionTrend({
  weeks,
}: {
  weeks: RetentionWeek[];
}) {
  const series = [...weeks]
    .sort((a, b) =>
      a.week_start.localeCompare(b.week_start)
    )
    .slice(-16);

  const rated = series.filter(
    (week) =>
      week.pass_rate !== null &&
      week.reviews > 0
  );

  if (rated.length === 0) {
    return (
      <div className="flex h-[150px] items-center justify-center">
        <p className="max-w-[250px] text-center text-xs text-ink-dim">
          Complete some reviews to see your weekly
          learning performance.
        </p>
      </div>
    );
  }

  const firstTime = Date.parse(
    `${series[0].week_start}T00:00:00Z`
  );

  const lastTime = Date.parse(
    `${series[series.length - 1].week_start}T00:00:00Z`
  );

  const numberOfWeeks =
    Math.round((lastTime - firstTime) / WEEK_MS) + 1;

  const byDate = new Map(
    series.map((week) => [week.week_start, week])
  );

  const calendar = Array.from(
    { length: numberOfWeeks },
    (_, index) => {
      const date = new Date(
        firstTime + index * WEEK_MS
      )
        .toISOString()
        .slice(0, 10);

      return {
        date,
        week: byDate.get(date),
      };
    }
  );

  const W = 620;
  const H = 170;

  const left = 58;
  const right = 25;
  const top = 12;
  const bottom = 132;

  const plotWidth = W - left - right;
  const plotHeight = bottom - top;

  const x = (index: number) =>
    numberOfWeeks === 1
      ? left + plotWidth / 2
      : left +
        (index / (numberOfWeeks - 1)) * plotWidth;

  const y = (rate: number) =>
    bottom - rate * plotHeight;

  const points: (Point | null)[] = calendar.map(
    ({ date, week }, index) => {
      if (
        !week ||
        week.pass_rate === null ||
        week.reviews === 0
      ) {
        return null;
      }

      return {
        x: x(index),
        y: y(week.pass_rate),
        date,
        rate: week.pass_rate,
        reviews: week.reviews,
      };
    }
  );

  // Keep missing weeks as gaps instead of
  // inventing performance data.
  const segments: Point[][] = [];
  let current: Point[] = [];

  for (const point of points) {
    if (point) {
      current.push(point);
    } else if (current.length > 0) {
      segments.push(current);
      current = [];
    }
  }

  if (current.length > 0) {
    segments.push(current);
  }

  const makeLine = (segment: Point[]) =>
    segment
      .map(
        (point, index) =>
          `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`
      )
      .join(' ');

  return (
    <figure className="mt-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full"
        aria-hidden="true"
      >
        <defs>
          <linearGradient
            id="cognit-retention-aurora"
            x1="0%"
            y1="0%"
            x2="0%"
            y2="100%"
          >
            <stop
              offset="0%"
              stopColor="var(--state-due)"
              stopOpacity={0.19}
            />
            <stop
              offset="40%"
              stopColor="var(--state-due)"
              stopOpacity={0.09}
            />
            <stop
              offset="75%"
              stopColor="var(--state-due)"
              stopOpacity={0.025}
            />
            <stop
              offset="100%"
              stopColor="var(--state-due)"
              stopOpacity={0}
            />
          </linearGradient>
        </defs>

        {/* Horizontal grid and percentages */}
        {[0, 25, 50, 75, 100].map((tick) => (
          <g key={tick}>
            <line
              x1={left}
              x2={W - right}
              y1={y(tick / 100)}
              y2={y(tick / 100)}
              stroke="var(--border-strong)"
              strokeWidth={0.7}
              strokeDasharray={
                tick === 0 ? undefined : '2 4'
              }
              opacity={tick === 0 ? 1 : 0.65}
            />

            <text
              x={left - 10}
              y={y(tick / 100) + 3.5}
              textAnchor="end"
              fontSize={10}
              fill="var(--ink-dim)"
            >
              {tick}%
            </text>
          </g>
        ))}

        {/* Y-axis title */}
        <text
          transform="translate(12 72) rotate(-90)"
          textAnchor="middle"
          fontSize={10}
          fill="var(--ink-dim)"
        >
          Review success rate (%)
        </text>

        {/* Fading area underneath each valid segment */}
        {segments.map((segment) => {
          if (segment.length < 2) return null;

          const first = segment[0];
          const last = segment[segment.length - 1];

          return (
            <path
              key={`area-${first.date}`}
              d={`${makeLine(segment)}
                L ${last.x} ${bottom}
                L ${first.x} ${bottom} Z`}
              fill="url(#cognit-retention-aurora)"
            />
          );
        })}

        {/* Burnt-orange performance line */}
        {segments.map((segment) => (
          <path
            key={`line-${segment[0].date}`}
            d={makeLine(segment)}
            fill="none"
            stroke="var(--state-due)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {/* Solid data points */}
        {points.map((point) =>
          point ? (
            <g key={point.date}>
              <circle
                cx={point.x}
                cy={point.y}
                r={9}
                fill="transparent"
              >
                <title>
                  {`${formatDate(point.date)}: ${Math.round(point.rate * 100)}% success rate, ${point.reviews} eligible reviews`}
                </title>
              </circle>

              <circle
                cx={point.x}
                cy={point.y}
                r={3.8}
                fill="var(--state-due)"
                pointerEvents="none"
              />
            </g>
          ) : null
        )}

        {/* X-axis calendar labels */}
        {calendar.map(({ date }, index) => {
          const showLabel =
            numberOfWeeks <= 8 ||
            index === 0 ||
            index === calendar.length - 1 ||
            (
              index % 2 === 0 &&
              index < calendar.length - 2
            );

          return (
            <g key={date}>
              <line
                x1={x(index)}
                x2={x(index)}
                y1={bottom}
                y2={bottom + 3}
                stroke="var(--border-strong)"
              />

              {showLabel && (
                <text
                  x={x(index)}
                  y={bottom + 14}
                  textAnchor="middle"
                  fontSize={10}
                  fill="var(--ink-dim)"
                >
                  {formatDate(date)}
                </text>
              )}
            </g>
          );
        })}

        {/* X-axis title */}
        <text
          x={left + plotWidth / 2}
          y={H - 4}
          textAnchor="middle"
          fontSize={10}
          fill="var(--ink-dim)"
        >
          Week
        </text>
      </svg>

      <ChartDataTable
        caption="Weekly review success rates and eligible review counts. Missing weeks have no eligible review results."
        columns={[
          'Week',
          'Review success rate',
          'Eligible reviews',
        ]}
        rows={calendar.map(({ date, week }) => [
          date,
          week?.pass_rate === null ||
          week?.pass_rate === undefined ||
          week.reviews === 0
            ? 'No eligible reviews'
            : `${Math.round(week.pass_rate * 100)}%`,
          week?.reviews ?? 0,
        ])}
      />
    </figure>
  );
}