'use client';

import { useEffect } from 'react';

/**
 * Asks the server to fill this deck's missing embeddings and topic tags in the
 * background (performance plan AI-13). Rendered only while the deck has cards
 * missing either, and asks again whenever that count changes, so a card added
 * by hand is picked up without a model call per card.
 *
 * A route rather than a Server Action: a tab's Server Actions run one at a
 * time (PERF-10), and this must never hold the user's next save behind it.
 * Fire-and-forget; the server throttles it to one run a minute and the next
 * visit picks up whatever is left.
 */
export function CardDataBackfill({ deckId, pending }: { deckId: string; pending: number }) {
  useEffect(() => {
    void fetch('/api/decks/backfill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deckId }),
      keepalive: true,
    }).catch(() => {});
  }, [deckId, pending]);

  return null;
}
