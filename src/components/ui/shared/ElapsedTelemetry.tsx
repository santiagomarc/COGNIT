'use client';

import { useEffect, useState } from 'react';
import { Telemetry } from '@/components/ui/shared/Telemetry';
import { formatDuration } from '@/lib/session-clock';

/**
 * The only part of a study or quiz session that re-renders every second
 * (performance plan PERF-12, UIUX PERF-07). It used to be the whole
 * session client, which then also rewrote the session to sessionStorage on
 * each tick.
 *
 * Shows `baseMs` plus the time since this instance mounted while `running`.
 * Key it by `running` and `baseMs`, so each new running segment starts its
 * own count from the moment it began.
 */
export function ElapsedTelemetry({ baseMs, running }: { baseMs: number; running: boolean }) {
  const [segmentStart] = useState(() => Date.now());
  const [now, setNow] = useState(segmentStart);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  const elapsed = baseMs + (running ? Math.max(0, now - segmentStart) : 0);
  return <Telemetry label="Elapsed" value={formatDuration(elapsed)} />;
}
