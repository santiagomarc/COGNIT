'use client';

import { useState, useSyncExternalStore, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { purgeDeck, restoreDeck, type TrashedDeck } from '@/app/actions/deck-lifecycle';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/shared/ConfirmDialog';
import { formatActionError } from '@/lib/ai-feedback';

const DATE = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

/** True after hydration: dates are formatted in the viewer's locale, which the server cannot know. */
function useHasMounted() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

/**
 * The trash as a page (sidebar plan §4.4, DST-03): the old `TrashPanel`'s restore and
 * delete-forever logic without the `<details>`. The server page has already
 * purged anything past its 30 days and passes what is left.
 *
 * Dates are time, not memory (design system §2.2e), so they stay in ink;
 * "Delete forever" confirms in `--destructive` (§2.2d) through ConfirmDialog.
 */
export function TrashList({ decks: initialDecks }: { decks: TrashedDeck[] }) {
  const router = useRouter();
  const mounted = useHasMounted();
  const [decks, setDecks] = useState(initialDecks);
  const [purging, setPurging] = useState<TrashedDeck | null>(null);
  const [isPending, startTransition] = useTransition();

  const day = (iso: string) => (mounted ? DATE.format(new Date(iso)) : iso.slice(0, 10));

  const restore = (deck: TrashedDeck) =>
    startTransition(async () => {
      const result = await restoreDeck(deck.id);
      if ('error' in result && result.error) {
        toast.error(formatActionError(result.error, 'Could not restore the deck.'));
        return;
      }
      setDecks((rows) => rows.filter((row) => row.id !== deck.id));
      toast.success(`${deck.title} restored`);
      router.refresh();
    });

  const purge = (deck: TrashedDeck) =>
    startTransition(async () => {
      const result = await purgeDeck(deck.id);
      setPurging(null);
      if ('error' in result && result.error) {
        toast.error(formatActionError(result.error, 'Could not delete the deck.'));
        return;
      }
      setDecks((rows) => rows.filter((row) => row.id !== deck.id));
      router.refresh();
    });

  if (decks.length === 0) {
    return (
      <p className="well px-4 py-8 text-center text-[13px] text-ink-dim">
        Nothing in the trash. Deleted decks stay here for 30 days.
      </p>
    );
  }

  return (
    <>
      <ul className="well px-3.5">
        {decks.map((deck) => (
          <li
            key={deck.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border py-3 last:border-b-0"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-ink">{deck.title}</p>
              <p className="mt-0.5 text-[12px] text-ink-dim">
                <span className="font-mono tnum">{deck.cardCount}</span> {deck.cardCount === 1 ? 'card' : 'cards'} · deleted{' '}
                <time dateTime={deck.deletedAt} className="text-ink">{day(deck.deletedAt)}</time> · removed for good{' '}
                <time dateTime={deck.purgeAfter} className="text-ink">{day(deck.purgeAfter)}</time>
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                type="button"
                size="sm"
                disabled={isPending}
                onClick={() => restore(deck)}
                aria-label={`Restore ${deck.title}`}
              >
                Restore
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={isPending}
                onClick={() => setPurging(deck)}
                aria-label={`Delete ${deck.title} forever`}
              >
                Delete forever
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={purging !== null}
        onOpenChange={(open) => {
          if (!open) setPurging(null);
        }}
        title="Delete this deck forever?"
        description="Its cards, review history and drills are removed now. This cannot be undone."
        confirmLabel="Delete forever"
        variant="destructive"
        loading={isPending}
        onConfirm={() => {
          if (purging) purge(purging);
        }}
      />
    </>
  );
}
