type ActivityPoint = {
  date: string; // YYYY-MM-DD
  count: number;
};

type ActivityHeatmapProps = {
  activity: ActivityPoint[];
  monthsToShow?: number;
  anchorDate?: string;
};

type HeatmapCell = {
  date: string;
  count: number;
};

const MONTH = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' });

function toISODateUTC(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildHeatmapWeeks(
  activity: ActivityPoint[],
  monthsToShow: number,
  anchorDate?: string,
): HeatmapCell[][] {
  const parsedAnchor = anchorDate ? new Date(`${anchorDate}T00:00:00Z`) : null;
  const today = parsedAnchor && !Number.isNaN(parsedAnchor.getTime()) ? parsedAnchor : new Date();
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  const from = new Date(end);
  from.setUTCMonth(from.getUTCMonth() - monthsToShow);

  // Align start to Sunday so columns map to full weeks.
  while (from.getUTCDay() !== 0) {
    from.setUTCDate(from.getUTCDate() - 1);
  }

  const countByDate = new Map(activity.map((entry) => [entry.date, entry.count]));
  const allDays: HeatmapCell[] = [];

  const cursor = new Date(from);
  while (cursor <= end) {
    const iso = toISODateUTC(cursor);
    allDays.push({
      date: iso,
      count: countByDate.get(iso) ?? 0,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const weeks: HeatmapCell[][] = [];
  for (let i = 0; i < allDays.length; i += 7) {
    weeks.push(allDays.slice(i, i + 7));
  }

  return weeks;
}

function getIntensity(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 10) return 3;
  return 4;
}

/**
 * Six months of review activity (design system §2.2, Run 6 Task 2.4).
 *
 * A sequential **one-hue** ramp — ink on the surface, five steps, monotonic.
 * It carries no state colour on purpose: activity is a count, not an SM-2
 * state, and spending the state channel on it would put hue on the screen that
 * reports nothing about the user's memory.
 *
 * The ramp used to be Tailwind opacity utilities topping out at full
 * `bg-primary`, which made a six-month grid the brightest object on the
 * dashboard — a retrospective reading outshouting the actionable one. The top
 * step is now capped at 0.64 white / 0.72 ink and the steps live in tokens, so
 * both themes are tuned rather than inverted.
 *
 * Cells carry no border: a stroke around every cell is data-weight ink that is
 * not data. The 2.5px gap is the separator.
 *
 * A server component — it renders a static grid of numbers already computed.
 */
export function ActivityHeatmap({ activity, monthsToShow = 6, anchorDate }: ActivityHeatmapProps) {
  const weeks = buildHeatmapWeeks(activity, monthsToShow, anchorDate);

  /*
   * A month label sits above the first week that starts a new month, so the
   * labels land in register with the columns instead of being spaced by hand —
   * which drifts as soon as the window length changes.
   */
  const monthLabels = weeks.map((week, index) => {
    const first = week[0];
    if (!first) return null;
    const date = new Date(`${first.date}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return null;
    if (index === 0) return null;
    const previous = weeks[index - 1]?.[0];
    if (!previous) return null;
    const previousMonth = new Date(`${previous.date}T00:00:00Z`).getUTCMonth();
    return date.getUTCMonth() === previousMonth ? null : MONTH.format(date);
  });

  return (
    <div className="inline-flex min-w-max flex-col gap-1.5">
      <div className="flex gap-[2.5px]">
        {weeks.map((week, weekIndex) => (
          <div key={week[0]?.date ?? weekIndex} className="flex w-[10px] flex-col gap-[2.5px]">
            {week.map((cell) => {
              const studiedLabel =
                cell.count === 0
                  ? 'No activity'
                  : `${cell.count} card${cell.count === 1 ? '' : 's'} studied`;

              return (
                <div
                  key={cell.date}
                  title={`${studiedLabel} on ${cell.date}`}
                  aria-label={`${studiedLabel} on ${cell.date}`}
                  className="h-[10px] w-[10px] rounded-[2px]"
                  style={{ backgroundColor: `var(--heat-ramp-${getIntensity(cell.count)})` }}
                />
              );
            })}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-[2.5px]">
        {monthLabels.map((label, index) => (
          <span
            key={weeks[index]?.[0]?.date ?? index}
            className="w-[10px] shrink-0 font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer"
          >
            {label ? <span className="relative whitespace-nowrap">{label}</span> : null}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-end gap-1.5 font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
        <span>Less</span>
        {([0, 1, 2, 3, 4] as const).map((step) => (
          <span
            key={step}
            aria-hidden="true"
            className="h-[9px] w-[9px] rounded-[2px]"
            style={{ backgroundColor: `var(--heat-ramp-${step})` }}
          />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}
