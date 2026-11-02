/** How long the newest grade waits for an Undo before it is sent (UIUX plan §5.6). */
export const UNDO_WINDOW_MS = 6_000;

type HeldGradeOptions<T> = {
  windowMs?: number;
  /** Called with a job that was not undone: send it. */
  onRelease: (job: T) => void;
  /** Called whenever the held job changes, so the UI can offer or withdraw Undo. */
  onChange?: (job: T | null) => void;
};

/**
 * One slot that holds the newest grade for a short window instead of sending it.
 *
 * Every grade except the newest goes out at once; the newest waits here. It is
 * released when another grade is held, when the window closes, or when `flush`
 * is called (Save & exit, tab hidden). `undo` takes it back before that.
 *
 * Honest limit: a grade held when the tab crashes is lost. The card keeps its
 * old schedule and comes back as due, which is the safe direction.
 */
export function createHeldGrade<T>({ windowMs = UNDO_WINDOW_MS, onRelease, onChange }: HeldGradeOptions<T>) {
  let held: T | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const release = () => {
    if (held === null) return;
    const job = held;
    held = null;
    clearTimer();
    onRelease(job);
    onChange?.(null);
  };

  return {
    /** Holds `job`, releasing whatever was held before it. */
    hold(job: T) {
      release();
      held = job;
      timer = setTimeout(release, windowMs);
      onChange?.(job);
    },
    /** Takes the held job back unsent. Null once the window has closed. */
    undo(): T | null {
      if (held === null) return null;
      const job = held;
      held = null;
      clearTimer();
      onChange?.(null);
      return job;
    },
    /** Sends the held job now. */
    flush: release,
    /** Drops the held job without sending or restoring it (a failed earlier grade made it moot). */
    discard() {
      if (held === null) return;
      held = null;
      clearTimer();
      onChange?.(null);
    },
    isHolding: () => held !== null,
  };
}
