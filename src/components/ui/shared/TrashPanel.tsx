'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { listTrashedDecks, purgeDeck, restoreDeck, type TrashedDeck } from '@/app/actions/deck-lifecycle';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/shared/ConfirmDialog';
import { formatActionError } from '@/lib/ai-feedback';

const LABEL = 'font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer';
const DATE = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

/**
 * "Recently deleted" (plan §4.1a). Loads only when opened — the dashboard pays
 * nothing for it — and the load itself purges anything past its 30 days.
 */
export function TrashPanel() {
  const router = useRouter();
  const [decks, setDecks] = useState<TrashedDeck[] | null>(null);
  const [purging, setPurging] = useState<TrashedDeck | null>(null);
  const [isPending, startTransition] = useTransition();

  const load = () => startTransition(async () => {
    const result = await listTrashedDecks();
    if (!('success' in result) || !result.success) {
      toast.error(formatActionError('error' in result ? result.error : null, 'Could not load the trash.'));
      return;
    }
    setDecks(result.decks);
  });

  const restore = (deck: TrashedDeck) => startTransition(async () => {
    const result = await restoreDeck(deck.id);
    if ('error' in result && result.error) {
      toast.error(formatActionError(result.error, 'Could not restore the deck.'));
      return;
    }
    setDecks((current) => current?.filter((row) => row.id !== deck.id) ?? null);
    toast.success(`${deck.title} restored`);
    router.refresh();
  });

  const purge = (deck: TrashedDeck) => startTransition(async () => {
    const result = await purgeDeck(deck.id);
    setPurging(null);
    if ('error' in result && result.error) {
      toast.error(formatActionError(result.error, 'Could not delete the deck.'));
      return;
    }
    setDecks((current) => current?.filter((row) => row.id !== deck.id) ?? null);
  });

  return (
    <details
      className="well px-3.5 py-2"
      onToggle={(event) => {
        if (event.currentTarget.open && decks === null) load();
      }}
    >
      <summary className={`${LABEL} cursor-pointer py-1`}>Recently deleted</summary>
      {decks === null ? (
        <p className="py-2 text-[13px] text-ink-dim" aria-live="polite">{isPending ? 'Loading…' : ''}</p>
      ) : decks.length === 0 ? (
        <p className="py-2 text-[13px] text-ink-dim">Nothing in the trash.</p>
      ) : (
        <ul>
          {decks.map((deck) => (
            <li key={deck.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border py-2.5 last:border-b-0">
              <span className="min-w-0 flex-1 truncate text-sm text-ink">{deck.title}</span>
              <span className="font-mono text-[12px] tnum text-ink-dimmer">
                {deck.cardCount} cards · deleted for good {DATE.format(new Date(deck.purgeAfter))}
              </span>
              <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={() => restore(deck)} aria-label={`Restore ${deck.title}`}>
                Restore
              </Button>
              <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={() => setPurging(deck)} aria-label={`Delete ${deck.title} forever`}>
                Delete forever
              </Button>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={purging !== null}
        onOpenChange={(open) => { if (!open) setPurging(null); }}
        title="Delete this deck forever?"
        description="Its cards, review history and drills are removed now. This cannot be undone."
        confirmLabel="Delete forever"
        variant="destructive"
        loading={isPending}
        onConfirm={() => { if (purging) purge(purging); }}
      />
    </details>
  );
}
