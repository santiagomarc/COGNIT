'use client';

import { cn } from '@/lib/utils';

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

function getCellClass(intensity: 0 | 1 | 2 | 3 | 4): string {
  switch (intensity) {
    case 1:
      return 'bg-primary/25 border-primary/30';
    case 2:
      return 'bg-primary/45 border-primary/50';
    case 3:
      return 'bg-primary/65 border-primary/70';
    case 4:
      return 'bg-primary border-primary';
    default:
      return 'bg-muted/40 border-border/60';
  }
}

export function ActivityHeatmap({ activity, monthsToShow = 6, anchorDate }: ActivityHeatmapProps) {
  const weeks = buildHeatmapWeeks(activity, monthsToShow, anchorDate);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto pb-1">
        <div className="inline-flex gap-1 min-w-max">
          {weeks.map((week, weekIndex) => (
            <div key={`${week[0]?.date ?? weekIndex}`} className="grid grid-rows-7 gap-1">
              {week.map((cell) => {
                const intensity = getIntensity(cell.count);
                const studiedLabel =
                  cell.count === 0
                    ? 'No activity'
                    : `${cell.count} card${cell.count === 1 ? '' : 's'} studied`;

                return (
                  <div
                    key={cell.date}
                    title={`${studiedLabel} on ${cell.date}`}
                    aria-label={`${studiedLabel} on ${cell.date}`}
                    className={cn(
                      'h-3 w-3 rounded-[3px] border transition-transform duration-150 hover:scale-125',
                      getCellClass(intensity),
                    )}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>{monthsToShow} month activity</span>
        <div className="flex items-center gap-1.5">
          <span>Less</span>
          <span className="h-2.5 w-2.5 rounded-[3px] border border-border/60 bg-muted/40" />
          <span className="h-2.5 w-2.5 rounded-[3px] border border-primary/30 bg-primary/25" />
          <span className="h-2.5 w-2.5 rounded-[3px] border border-primary/50 bg-primary/45" />
          <span className="h-2.5 w-2.5 rounded-[3px] border border-primary/70 bg-primary/65" />
          <span className="h-2.5 w-2.5 rounded-[3px] border border-primary bg-primary" />
          <span>More</span>
        </div>
      </div>
    </div>
  );
}
