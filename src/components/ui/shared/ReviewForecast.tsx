import type { ForecastDay } from '@/lib/dashboard-forecast';

type ReviewForecastProps = {
  days: ForecastDay[];
};

const WEEKDAY = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' });

/**
 * The seven-day SM-2 forecast.
 *
 * Bars are `--border-strong` and only today's takes `--state-due`, because
 * today is the only column that is a state — the rest are a projection, and
 * colouring a projection would say the scheduler knows something it does not.
 *
 * Every column is labelled with the count it reaches, so the chart never asks
 * the reader to estimate a value off a bar height (§2.3).
 *
 * A server component: it is a static projection of numbers already computed.
 */
export function ReviewForecast({ days }: ReviewForecastProps) {
  const peak = Math.max(1, ...days.map((day) => day.count));
  const total = days.reduce((sum, day) => sum + day.count, 0);

  return (
    <section className="surface p-5 md:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
          Next seven days
        </h2>
        <p className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] tnum text-ink-dimmer">
          {total} cards
        </p>
      </div>

      <div className="mt-5 grid grid-cols-7 items-end gap-2">
        {days.map((day) => {
          const heightPercent = day.count === 0 ? 0 : Math.max(6, (day.count / peak) * 100);

          return (
            <div key={day.date} className="flex flex-col items-center gap-2">
              <span className="font-mono text-[13px] leading-none tnum text-ink-dim">
                {day.count}
              </span>

              {/* Capped width: a bar stretched across a seventh of a 1440px
                  page stops reading as a bar and starts reading as a slab. */}
              <span className="flex h-16 w-full max-w-[72px] items-end" aria-hidden="true">
                <span
                  className="block w-full rounded-[1px]"
                  style={{
                    height: `${heightPercent}%`,
                    backgroundColor: day.isToday ? 'var(--state-due)' : 'var(--border-strong)',
                  }}
                />
              </span>

              <span className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
                {day.isToday ? 'Today' : WEEKDAY.format(new Date(`${day.date}T00:00:00Z`))}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
