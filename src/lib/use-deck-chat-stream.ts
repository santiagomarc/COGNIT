'use client';

import { useCallback, useRef, useState } from 'react';

export type ChatReference = { id: string; front: string; similarity: number | null };

export type StreamStatus = 'idle' | 'retrieving' | 'streaming' | 'done' | 'error';

export type StreamState = {
  status: StreamStatus;
  answer: string;
  references: ChatReference[];
  followupSuggestions: string[];
  /** false ⇒ the deck did not cover the question; render it distinctly. */
  grounded: boolean;
  degraded: boolean;
  sessionId: string | null;
  errorMessage: string | null;
  retryable: boolean;
};

const INITIAL: StreamState = {
  status: 'idle',
  answer: '',
  references: [],
  followupSuggestions: [],
  grounded: true,
  degraded: false,
  sessionId: null,
  errorMessage: null,
  retryable: false,
};

type SendInput = {
  deckId: string;
  message: string;
  sessionId: string | null;
  topK?: number;
};

/**
 * Parses an SSE body incrementally.
 *
 * Hand-rolled rather than using EventSource because EventSource cannot issue
 * POST requests, and the request carries a JSON body.
 */
export function useDeckChatStream() {
  const [state, setState] = useState<StreamState>(INITIAL);
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const reset = useCallback(() => setState(INITIAL), []);

  const send = useCallback(async (input: SendInput) => {
    cancel();
    const controller = new AbortController();
    abortRef.current = controller;

    setState({ ...INITIAL, status: 'retrieving', sessionId: input.sessionId });

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          deck_id: input.deckId,
          session_id: input.sessionId ?? undefined,
          message: input.message,
          top_k: input.topK ?? 5,
        }),
      });

      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => ({ error: null }));
        const raw = (payload as { error?: unknown }).error;
        const message = typeof raw === 'string'
          ? raw
          : 'Deck chat is unavailable right now. Please try again.';

        setState((s) => ({
          ...s,
          status: 'error',
          errorMessage: message,
          retryable: response.status >= 500 || response.status === 429,
        }));
        return;
      }

      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;

        const { frames, rest } = takeCompleteFrames(buffer + value);
        buffer = rest;
        for (const frame of frames) applyFrame(frame, setState);
      }

      setState((s) => (s.status === 'error' ? s : { ...s, status: 'done' }));
    } catch (error) {
      // An abort is a deliberate cancel (navigation, or a newer send).
      if (controller.signal.aborted) return;

      setState((s) => ({
        ...s,
        status: 'error',
        retryable: true,
        errorMessage: 'Lost connection to deck chat. Please try again.',
      }));
      void error;
    } finally {
      abortRef.current = null;
    }
  }, [cancel]);

  return { state, send, cancel, reset };
}

/**
 * Splits an SSE buffer into complete frames, returning whatever trailing
 * partial frame is left over.
 *
 * A network chunk can end anywhere — including mid-frame, or between the two
 * newlines of a frame separator — so the leftover MUST be carried into the next
 * read. Exported for tests; this is the piece most likely to break subtly.
 */
export function takeCompleteFrames(buffer: string): { frames: string[]; rest: string } {
  const frames: string[] = [];
  let rest = buffer;

  let boundary = rest.indexOf('\n\n');
  while (boundary !== -1) {
    frames.push(rest.slice(0, boundary));
    rest = rest.slice(boundary + 2);
    boundary = rest.indexOf('\n\n');
  }

  return { frames, rest };
}

/** Exported for tests. Parses one SSE frame into {event, data}. */
export function parseFrame(frame: string): { event: string; data: string } {
  let event = 'message';
  let data = '';

  for (const line of frame.split('\n')) {
    if (line.startsWith('event: ')) event = line.slice(7).trim();
    else if (line.startsWith('data: ')) data += line.slice(6);
  }

  return { event, data };
}

function applyFrame(
  frame: string,
  setState: React.Dispatch<React.SetStateAction<StreamState>>,
) {
  const { event, data } = parseFrame(frame);
  if (!data) return;

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(data) as Record<string, unknown>;
  } catch {
    return;
  }

  switch (event) {
    case 'meta':
      setState((s) => ({
        ...s,
        status: 'streaming',
        sessionId: (payload.sessionId as string | undefined) ?? s.sessionId,
        references: (payload.references as ChatReference[] | undefined) ?? [],
        grounded: payload.grounded !== false,
        degraded: payload.degraded === true,
      }));
      break;

    case 'delta':
      setState((s) => ({
        ...s,
        status: 'streaming',
        answer: s.answer + ((payload.text as string | undefined) ?? ''),
      }));
      break;

    case 'done':
      setState((s) => ({
        ...s,
        status: 'done',
        followupSuggestions: (payload.followupSuggestions as string[] | undefined) ?? [],
      }));
      break;

    case 'error':
      setState((s) => ({
        ...s,
        status: 'error',
        answer: (payload.partial as string | undefined) ?? s.answer,
        errorMessage: (payload.message as string | undefined) ?? 'Deck chat failed.',
        retryable: payload.retryable === true,
      }));
      break;
  }
}
