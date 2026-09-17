import type { loadSeries } from '@/lib/analytics';

type Day = ReturnType<typeof loadSeries>[number];

const DAY_LABEL = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/**
 * Thirty days of review load — the dashboard band's seven-day sparkline,
 * widened. Weekends are dimmed so the eye can find them; the count is a
 * reading, not a state, so the bars stay ink (§2.2).
 */
export function LoadForecast({ days }: { days: Day[] }) {
  const peak = Math.max(1, ...days.map((day) => day.cards));
  const total = days.reduce((sum, day) => sum + day.cards, 0);
  const busiest = days.reduce<Day | null>((best, day) => (best === null || day.cards > best.cards ? day : best), null);

  return (
    <div className="mt-3">
      <div className="flex h-[64px] items-end gap-[3px]" aria-hidden="true">
        {days.map((day) => (
          <span
            key={day.date}
            title={`${DAY_LABEL.format(new Date(`${day.date}T00:00:00Z`))}: ${day.cards} ${day.cards === 1 ? 'card' : 'cards'}`}
            className="block flex-1 rounded-t-[2px]"
            style={{
              height: day.cards > 0 ? `${Math.max(8, (day.cards / peak) * 100)}%` : '2px',
              backgroundColor: day.cards > 0 ? (day.weekend ? 'var(--ink-dimmer)' : 'var(--ink-dim)') : 'var(--border)',
            }}
          />
        ))}
      </div>
      <p className="sr-only">
        {total} reviews scheduled over the next thirty days
        {busiest && busiest.cards > 0 ? `, peaking at ${busiest.cards} on ${busiest.date}` : ''}.
      </p>
      <div className="mt-1.5 flex items-baseline justify-between font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
        <span>Tomorrow</span>
        <span>
          <span className="tnum text-ink">{total}</span> in 30 days
          {busiest && busiest.cards > 0 ? (
            <>
              {' · peak '}<span className="tnum text-ink">{busiest.cards}</span>{' '}
              {DAY_LABEL.format(new Date(`${busiest.date}T00:00:00Z`))}
            </>
          ) : null}
        </span>
        <span>+30d</span>
      </div>
    </div>
  );
}
