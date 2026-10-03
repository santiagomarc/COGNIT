'use client';

import { useSyncExternalStore } from 'react';

const TIME = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const DAY = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });

function useHasMounted() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

type AiUsageMeterProps = {
  used: number;
  ceiling: number;
  /** ISO time the oldest call in the window stops counting; null with no calls. */
  nextFreesAt: string | null;
};

/**
 * Model calls in the last 24 hours against the ceiling (sidebar plan §5.8,
 * SET-07). Used for the first time users can see it: until now the limit
 * only appeared once they hit it.
 *
 * The meter is ink (design system §7.12): usage is not memory. It turns
 * `--destructive` only at the ceiling, where it is an error state (§2.2d).
 * The clock time is formatted after hydration, in the viewer's locale and
 * time zone, which the server cannot know.
 */
export function AiUsageMeter({ used, ceiling, nextFreesAt }: AiUsageMeterProps) {
  const mounted = useHasMounted();
  const atLimit = used >= ceiling;
  const percent = Math.min(100, Math.round((used / Math.max(1, ceiling)) * 100));

  let freesAt: string | null = null;
  if (mounted && nextFreesAt && used > 0) {
    const at = new Date(nextFreesAt);
    const sameDay = at.toDateString() === new Date().toDateString();
    freesAt = (sameDay ? TIME : DAY).format(at);
  }

  return (
    <div className="w-full md:w-[280px]">
      <p className="text-right font-mono text-[13px] tnum">
        <span className={atLimit ? 'text-destructive' : 'text-ink'}>{used}</span>
        <span className="text-ink-dimmer"> of {ceiling} calls</span>
      </p>
      <div
        role="meter"
        aria-label="AI calls used in the last 24 hours"
        aria-valuemin={0}
        aria-valuemax={ceiling}
        aria-valuenow={Math.min(used, ceiling)}
        className="mt-1.5 h-1 overflow-hidden rounded-[2px] bg-surface-raised"
      >
        <span
          className="block h-full"
          style={{ width: `${percent}%`, backgroundColor: atLimit ? 'var(--destructive)' : 'var(--ink-dim)' }}
        />
      </div>
      {freesAt ? (
        <p className="mt-1.5 text-right text-[12px] text-ink-dim">
          The oldest call clears at <span className="text-ink">{freesAt}</span>.
        </p>
      ) : null}
    </div>
  );
}
