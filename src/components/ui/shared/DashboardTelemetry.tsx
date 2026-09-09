import { Telemetry } from '@/components/ui/shared/Telemetry';

type DashboardTelemetryProps = {
  totalDue: number;
  /** Share of quiz-assessed cards answered correctly, or null with no data. */
  retentionPercentage: number | null;
  streakDays: number;
  reviewedToday: number;
  /** Search affordance and theme toggle — rendered on the right. */
  actions?: React.ReactNode;
};

/**
 * The persistent strip of account state (design system §7.9).
 *
 * ```
 * DUE 47   RETENTION 87%   STREAK 14d   REVIEWED TODAY 62      [ Search ⌘K ]
 * ```
 *
 * A value takes a state colour only when the value *is* a state. Due is orange
 * when there is work and colourless when there is none; an active streak is
 * amber and a broken one is not. Retention and reviewed-today are readings, not
 * states, so they stay `--ink` however good or bad they are.
 *
 * A server component: it renders numbers and has no interaction of its own.
 */
export function DashboardTelemetry({
  totalDue,
  retentionPercentage,
  streakDays,
  reviewedToday,
  actions,
}: DashboardTelemetryProps) {
  return (
    <header className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Telemetry label="Due" value={totalDue} tone={totalDue > 0 ? 'due' : 'ink'} />
          <Telemetry
            label="Retention"
            value={retentionPercentage === null ? '—' : `${retentionPercentage}%`}
          />
          <Telemetry
            label="Streak"
            value={`${streakDays}d`}
            tone={streakDays > 0 ? 'streak' : 'ink'}
          />
          <Telemetry label="Reviewed today" value={reviewedToday} />
        </div>

        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>

      {/* Depth is rule weight, not blur (§4.3). */}
      <div className="h-px w-full bg-border" />
    </header>
  );
}
