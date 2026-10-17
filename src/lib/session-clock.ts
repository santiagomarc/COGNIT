/**
 * Session clocks without a ticking parent (performance plan PERF-12, UIUX
 * PERF-07). A session's time is the time already folded in plus the running
 * segment; only a small readout re-renders each second, and the session
 * itself is saved on events, never on the clock.
 */

/** Adds a running segment to the folded total. `segmentStart` null means the clock is stopped. */
export function foldSegment(foldedMs: number, segmentStart: number | null, now: number): number {
  return segmentStart === null ? foldedMs : foldedMs + Math.max(0, now - segmentStart);
}

/** "42s", "3m", "3m 7s". */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`;
}
