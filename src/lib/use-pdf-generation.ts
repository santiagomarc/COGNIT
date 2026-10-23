'use client';

import { useCallback, useRef, useState } from 'react';
import { readSseStream } from '@/lib/sse-parsing';

/*
 * The browser end of `/api/generate` (performance plan AI-18): cards arrive
 * one at a time, each already saved; a long PDF that runs out of time in one
 * request continues from the section it stopped at, with what is left of the
 * count; Cancel aborts the fetch, which stops the server at the wave it is in.
 *
 * Leaving the page doesn't abort: the run finishes in the background (its
 * cards save, its toast still shows), as the old Server Action did. Closing
 * the tab does, and the page guards that with `beforeunload`.
 */

export type GeneratedCard = { id: string; front: string; back: string };

export type GenerationOutcome =
  | { kind: 'done'; saved: number; failedSections: number; limited: string | null }
  | { kind: 'cancelled'; saved: number }
  | { kind: 'error'; saved: number; message: string };

export type GenerationProgress = {
  /** Sections in the document, once the first response says. */
  sections: number;
  /** Sections answered so far, across continuations. */
  sectionsRead: number;
};

const NO_PROGRESS: GenerationProgress = { sections: 0, sectionsRead: 0 };

export function usePdfGeneration() {
  const [running, setRunning] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [cards, setCards] = useState<GeneratedCard[]>([]);
  const [progress, setProgress] = useState<GenerationProgress>(NO_PROGRESS);
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    if (!abortRef.current) return;
    setStopping(true);
    abortRef.current.abort();
  }, []);

  const clear = useCallback(() => setCards([]), []);

  const generate = useCallback(async (input: { file: File; deckId: string; count: string }): Promise<GenerationOutcome> => {
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setStopping(false);
    setCards([]);
    setProgress(NO_PROGRESS);

    let saved = 0;
    let failedSections = 0;
    let offset = 0;
    let count = input.count;

    try {
      for (;;) {
        const form = new FormData();
        form.append('file', input.file);
        form.append('deck_id', input.deckId);
        form.append('count', count);
        form.append('offset', String(offset));

        const response = await fetch('/api/generate', { method: 'POST', body: form, signal: controller.signal });
        if (!response.ok || !response.body) {
          return { kind: 'error', saved, message: await errorMessageOf(response) };
        }

        // How this response ended, set from the frame callback.
        const end: {
          next: { offset: number; count: string } | null;
          finished: { limited: string | null } | null;
          failure: string | null;
        } = { next: null, finished: null, failure: null };

        await readSseStream(response.body, (event, payload) => {
          switch (event) {
            case 'start':
              setProgress((current) => ({ ...current, sections: Number(payload.sections) || current.sections }));
              break;
            case 'card':
              saved += 1;
              setCards((current) => [...current, {
                id: String(payload.id),
                front: String(payload.front ?? ''),
                back: String(payload.back ?? ''),
              }]);
              break;
            case 'section':
              if (payload.status === 'failed') failedSections += 1;
              setProgress((current) => ({ ...current, sectionsRead: current.sectionsRead + 1 }));
              break;
            case 'more':
              end.next = { offset: Number(payload.nextOffset), count: String(payload.remaining) };
              break;
            case 'done':
              end.finished = { limited: typeof payload.limited === 'string' ? payload.limited : null };
              break;
            case 'error':
              end.failure = typeof payload.message === 'string' ? payload.message : 'Card generation failed.';
              break;
          }
        });

        if (end.failure) return { kind: 'error', saved, message: end.failure };
        if (end.finished) return { kind: 'done', saved, failedSections, limited: end.finished.limited };
        if (!end.next) {
          // The response ended without a last word: the function was cut off.
          return { kind: 'error', saved, message: 'The connection closed before generation finished.' };
        }
        ({ offset, count } = end.next);
      }
    } catch {
      if (controller.signal.aborted) return { kind: 'cancelled', saved };
      return { kind: 'error', saved, message: 'Lost connection while generating.' };
    } finally {
      abortRef.current = null;
      setRunning(false);
      setStopping(false);
    }
  }, []);

  return { running, stopping, cards, progress, generate, cancel, clear };
}

async function errorMessageOf(response: Response): Promise<string> {
  const payload = await response.json().catch(() => null) as { error?: unknown } | null;
  if (typeof payload?.error === 'string') return payload.error;
  // The platform's own limit answers before the route can (Vercel's request
  // body cap is below the app's 10 MB).
  if (response.status === 413) return 'That PDF is too large to upload. Try a smaller file, or split it.';
  return 'Card generation is unavailable right now. Please try again.';
}
