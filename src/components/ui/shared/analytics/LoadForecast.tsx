'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { ChartDataTable } from '@/components/ui/shared/analytics/ChartDataTable';
import type { loadSeries } from '@/lib/analytics';

type Day = ReturnType<typeof loadSeries>[number];
type Range = 7 | 30;

const SHORT_DATE = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

const LONG_DATE = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
});

function formatDate(date: string, long = false) {
  return (long ? LONG_DATE : SHORT_DATE).format(
    new Date(`${date}T00:00:00Z`)
  );
}

function tickStep(peak: number) {
  const rough = Math.max(1, peak / 4);
  const magnitude =
    10 ** Math.floor(Math.log10(rough));

  const normalized = rough / magnitude;

  const step =
    normalized <= 1
      ? 1
      : normalized <= 2
        ? 2
        : normalized <= 5
          ? 5
          : 10;

  return Math.max(1, step * magnitude);
}

export function LoadForecast({
  days,
}: {
  days: Day[];
}) {
  const [range, setRange] = useState<Range>(7);

  const visibleDays = days.slice(0, range);

  const total = visibleDays.reduce(
    (sum, day) => sum + day.cards,
    0
  );

  const peak = Math.max(
    0,
    ...visibleDays.map((day) => day.cards)
  );

  const busiest = visibleDays.find(
    (day) => day.cards === peak && peak > 0
  );

  const interval = tickStep(peak);

  const maximum = Math.max(
    interval * 4,
    Math.ceil(peak / interval) * interval
  );

  const ticks = Array.from(
    { length: maximum / interval + 1 },
    (_, index) => index * interval
  );

  const W = range === 7 ? 500 : 960;
  const H = 170;

  const left = 45;
  const right = 12;
  const top = 12;
  const bottom = 132;

  const plotWidth = W - left - right;
  const plotHeight = bottom - top;

  const step =
    plotWidth / Math.max(visibleDays.length, 1);

  const barWidth = Math.min(
    range === 7 ? 32 : 18,
    step * 0.57
  );

  const x = (index: number) =>
    left + step * index + step / 2;

  const y = (count: number) =>
    bottom - (count / maximum) * plotHeight;

  return (
    <div>
      {/* Heading and date-range controls */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2
            id="load-heading"
            className="type-h3 font-semibold leading-tight text-ink"
          >
            Upcoming Reviews
          </h2>

          <p className="mt-1 text-xs text-ink-dim">
            See how many flashcards are scheduled
            for review.
          </p>
        </div>

        <div
          className="flex items-center gap-1"
          role="group"
          aria-label="Review forecast range"
        >
          {([7, 30] as const).map((option) => (
            <Button
              key={option}
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={range === option}
              onClick={() => setRange(option)}
              className={
                range === option
                  ? 'h-auto min-h-7 rounded-[8px] border border-[#B7410E]/15 bg-[#B7410E]/10 px-2.5 py-1.5 text-[11px] font-semibold leading-none text-[var(--state-due)] aria-pressed:bg-[#B7410E]/10'
                  : 'h-auto min-h-7 rounded-[8px] border border-border px-2.5 py-1.5 text-[11px] font-medium leading-none text-ink-dim hover:text-ink'
              }
            >
              Next {option} days
            </Button>
          ))}
        </div>
      </div>

      {/* Chart and right-side statistics */}
      <div className="mt-2 grid min-w-0 items-center gap-3 sm:grid-cols-[minmax(0,1fr)_110px]">
        <div className="min-w-0">
          <div
            className={
              range === 30
                ? 'overflow-x-auto'
                : 'overflow-hidden'
            }
            role="region"
            aria-label={`${range}-day review forecast`}
            tabIndex={range === 30 ? 0 : undefined}
          >
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="block h-auto w-full"
              style={{
                minWidth: range === 30 ? W : undefined,
              }}
              aria-hidden="true"
            >
              {ticks.map((tick) => (
                <g key={tick}>
                  <line
                    x1={left}
                    x2={W - right}
                    y1={y(tick)}
                    y2={y(tick)}
                    stroke="var(--border-strong)"
                    strokeWidth={0.7}
                    strokeDasharray={
                      tick === 0 ? undefined : '2 4'
                    }
                    opacity={tick === 0 ? 1 : 0.65}
                  />

                  <text
                    x={left - 8}
                    y={y(tick) + 3.5}
                    textAnchor="end"
                    fontSize={10}
                    fill="var(--ink-dim)"
                  >
                    {tick}
                  </text>
                </g>
              ))}

              <text
                transform="translate(11 72) rotate(-90)"
                textAnchor="middle"
                fontSize={10}
                fill="var(--ink-dim)"
              >
                Flashcards due
              </text>

              {visibleDays.map((day, index) => {
                const isBusiest =
                  day.date === busiest?.date;

                return (
                  <g key={day.date}>
                    {/* Hover target */}
                    <rect
                      x={x(index) - step / 2}
                      y={top}
                      width={step}
                      height={plotHeight}
                      fill="transparent"
                    >
                      <title>
                        {`${formatDate(day.date, true)}: ${day.cards} scheduled flashcards`}
                      </title>
                    </rect>

                    {day.cards > 0 ? (
                      <rect
                        x={x(index) - barWidth / 2}
                        y={y(day.cards)}
                        width={barWidth}
                        height={bottom - y(day.cards)}
                        rx={3}
                        fill={
                          isBusiest
                            ? 'var(--state-due)'
                            : 'var(--ink-dimmer)'
                        }
                        opacity={
                          isBusiest ? 1 : 0.62
                        }
                        pointerEvents="none"
                      />
                    ) : (
                      <text
                        x={x(index)}
                        y={bottom - 5}
                        textAnchor="middle"
                        fontSize={10}
                        fill="var(--ink-dimmer)"
                        pointerEvents="none"
                      >
                        0
                      </text>
                    )}

                    <text
                      x={x(index)}
                      y={bottom + 14}
                      textAnchor="middle"
                      fontSize={10}
                      fill="var(--ink-dim)"
                    >
                      {range === 7
                        ? formatDate(day.date)
                        : day.date.slice(8)}
                    </text>

                    {range === 30 &&
                      (
                        index === 0 ||
                        day.date.slice(8) === '01'
                      ) && (
                        <text
                          x={x(index)}
                          y={bottom + 25}
                          textAnchor="middle"
                          fontSize={9}
                          fill="var(--ink-dim)"
                        >
                          {formatDate(day.date).split(' ')[0]}
                        </text>
                      )}
                  </g>
                );
              })}

              <text
                x={left + plotWidth / 2}
                y={H - 3}
                textAnchor="middle"
                fontSize={10}
                fill="var(--ink-dim)"
              >
                Scheduled review date
              </text>
            </svg>
          </div>
        </div>

        {/* Right-hand summary */}
        <div
          className="flex flex-wrap items-start gap-x-5 gap-y-2 border-t border-border pt-2 sm:flex-col sm:border-t-0 sm:border-l sm:py-2 sm:pl-3"
          aria-live="polite"
        >
          <div>
            <p className="text-[11px] text-ink-dim">
              Total scheduled
            </p>

            <p className="mt-1 font-mono text-[20px] font-semibold leading-tight tnum text-ink">
              {total} {total === 1 ? 'card' : 'cards'}
            </p>
          </div>

          <div className="hidden h-px w-8 bg-[var(--border)] sm:block" />

          <div>
            <p className="text-[11px] text-ink-dim">
              Busiest day
            </p>

            <p className="mt-1 font-sans text-sm font-semibold leading-tight text-ink">
              {busiest
                ? formatDate(busiest.date, true)
                : 'None scheduled'}
            </p>
          </div>
        </div>
      </div>

      <p className="mt-1 text-[11px] text-ink-dimmer">
        Future reviews only; excludes today and overdue cards.
        {range === 30 ? ' Scroll to view all dates.' : ''}
      </p>

      <ChartDataTable
        caption={`Scheduled flashcards for the next ${range} days`}
        columns={['Date', 'Scheduled flashcards']}
        rows={visibleDays.map((day) => [
          day.date,
          day.cards,
        ])}
      />
    </div>
  );
}