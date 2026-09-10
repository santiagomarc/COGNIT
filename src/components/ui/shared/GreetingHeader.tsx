'use client';

import { Telemetry } from '@/components/ui/shared/Telemetry';
import { useHasMounted } from '@/components/motion';
import { greetingForHour } from '@/lib/display-name';

type GreetingHeaderProps = {
  /** Already resolved on the server via `resolveDisplayName`. Null is a real answer. */
  name: string | null;
  totalDue: number;
  retentionPercentage: number | null;
  streakDays: number;
  reviewedToday: number;
  /** Decks with at least one card due. */
  dueDeckCount: number;
  deckCount: number;
  /** Search affordance and anything else that belongs at the end of the strip. */
  actions?: React.ReactNode;
};

const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/**
 * The dashboard's top row: who you are on the left, what your memory is doing
 * on the right (Run 6, Task 2.1).
 *
 * The telemetry cluster used to run full-width above everything and the page
 * opened with no addressee at all. Splitting the row gives the screen a
 * subject and puts the four readings where the eye ends a scan rather than
 * where it starts one.
 *
 * **The greeting deliberately carries no information.** `name` is null for
 * anyone who signed up with an email address and never set a display name —
 * the common case on this product — and "Good evening," with nothing after the
 * comma is a bug. So the sub-line carries the facts and the greeting carries
 * only the address, which makes it safe to drop.
 *
 * It never renders an email. See `resolveDisplayName` and F-06.
 */
export function GreetingHeader({
  name,
  totalDue,
  retentionPercentage,
  streakDays,
  reviewedToday,
  dueDeckCount,
  deckCount,
  actions,
}: GreetingHeaderProps) {
  /*
   * Time of day is the user's, not the server's. Branching on the server clock
   * produces a hydration mismatch on every session that straddles a boundary,
   * so the server and the first client render both emit the neutral form and
   * the local clock takes over once mounted.
   *
   * `useHasMounted` is a `useSyncExternalStore` read, not state in an effect —
   * so this costs no cascading render, which is the same reason LoginClient
   * uses it to gate its reduced-motion branch.
   */
  const hasMounted = useHasMounted();
  const now = hasMounted ? new Date() : null;

  const salutation = now ? `Good ${greetingForHour(now.getHours())}` : 'Welcome back';
  const today = now ? DATE_FORMAT.format(now) : null;

  return (
    <header>
      <div className="flex flex-col gap-y-4 pb-3.5 lg:flex-row lg:items-end lg:justify-between lg:gap-x-10">
        <div className="min-w-0">
          <h1 className="font-serif text-[1.8125rem] leading-[1.1] tracking-[-0.02em] text-balance text-ink sm:type-display">
            {name ? `${salutation}, ${name}` : salutation}
          </h1>
          <p className="mt-1.5 text-[13px] text-ink-dim">
            {today ? <>{today} · </> : null}
            <span className="font-mono tnum text-ink">{dueDeckCount}</span> of{' '}
            <span className="font-mono tnum text-ink">{deckCount}</span>{' '}
            {deckCount === 1 ? 'deck needs' : 'decks need'} you today
          </p>
        </div>

        {/*
          A value takes a state colour only when the value *is* a state (§7.9).
          Due is orange when there is work; an active streak is amber. Retention
          and reviewed-today are readings, not states, and stay --ink however
          good or bad they are.
        */}
        <div className="flex shrink-0 flex-wrap items-baseline gap-x-6 gap-y-3 lg:pb-1">
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
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </div>
      </div>

      {/* Depth is rule weight, and a rule that stops short of the gutter reads
          as structure rather than as a container edge. */}
      <div className="rule" />
    </header>
  );
}
