'use client';

import { useCallback, useRef, useState } from 'react';
import { readSseStream } from '@/lib/sse-parsing';

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
 * Deck chat over SSE (`/api/chat`); the frame parsing is shared with PDF
 * generation in sse-parsing.ts.
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

      await readSseStream(response.body, (event, payload) => applyEvent(event, payload, setState));

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

function applyEvent(
  event: string,
  payload: Record<string, unknown>,
  setState: React.Dispatch<React.SetStateAction<StreamState>>,
) {
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
