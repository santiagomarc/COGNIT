'use client';

import { useEffect, useState } from 'react';
import { whenIdle } from '@/lib/when-idle';

/**
 * `waiting`: the dialog's code isn't loaded and this hook listens for its
 * triggers. `mounted`: loaded while idle and mounted closed; its own listeners
 * take over. `open`: a trigger came first; mount it open.
 */
export type LazyDialogMode = 'waiting' | 'mounted' | 'open';

/**
 * Loads a dialog's code on first use instead of with the page (performance
 * plan PERF-13). Until then a hotkey or the dialog's open event mounts it
 * already open; meanwhile its code is prefetched once the browser is idle, so
 * the first open is instant and the page's own load stays lighter.
 * `opensOn` and `preload` must be stable (module-level) functions.
 */
export function useLazyDialog(options: {
  eventName: string;
  opensOn: (event: KeyboardEvent) => boolean;
  preload: () => Promise<unknown>;
}): LazyDialogMode {
  const { eventName, opensOn, preload } = options;
  const [mode, setMode] = useState<LazyDialogMode>('waiting');

  useEffect(() => {
    if (mode !== 'waiting') return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (!opensOn(event)) return;
      event.preventDefault();
      setMode('open');
    };
    const onRequest = () => setMode('open');
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener(eventName, onRequest);

    // Mount closed only once the code is in, so no trigger falls between this
    // listener going away and the dialog's own listener arriving.
    const cancelIdle = whenIdle(() => {
      void preload().then(() => setMode((current) => (current === 'waiting' ? 'mounted' : current)));
    });

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener(eventName, onRequest);
      cancelIdle();
    };
  }, [mode, eventName, opensOn, preload]);

  return mode;
}
