/**
 * Runs `callback` once the browser is idle after load, so prefetching code a
 * user may need soon never competes with the page becoming interactive.
 * Safari has no requestIdleCallback; a short timeout stands in. Returns a
 * cancel function.
 */
export function whenIdle(callback: () => void, timeoutMs = 2000): () => void {
  if (typeof window === 'undefined') return () => {};
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(() => callback(), { timeout: timeoutMs });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(callback, 1200);
  return () => window.clearTimeout(id);
}
