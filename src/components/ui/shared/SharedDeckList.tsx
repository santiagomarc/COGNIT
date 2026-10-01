'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';

import { setDeckListing } from '@/app/actions/deck-lifecycle';
import { setDeckSharing } from '@/app/actions/share';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { formatActionError } from '@/lib/ai-feedback';
import type { SharedDeck } from '@/lib/sharing';

type SharedDeckListProps = {
  decks: SharedDeck[];
  /** `EXPLORE_ENABLED`, read on the server: the listing switch only exists with the directory. */
  exploreEnabled: boolean;
};

const LINK =
  'rounded-[var(--radius-sm)] outline-hidden hover:underline hover:underline-offset-[3px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]';

/**
 * Every deck the user shares, with the two things one does to a link: copy it
 * or turn it off (sidebar plan §4.3, DST-02). The Shared page and Settings →
 * Sharing render this same list (D11).
 *
 * Turning a link off keeps its token (`set_deck_sharing`, 202609070910), so
 * the toast's Undo turns the SAME link back on — anyone who already has it
 * keeps a working URL.
 */
export function SharedDeckList({ decks: initialDecks, exploreEnabled }: SharedDeckListProps) {
  const [decks, setDecks] = useState(initialDecks);
  const [pending, setPending] = useState<string | null>(null);
  const [origin, setOrigin] = useState('');

  // window is not available during SSR, so the URL is assembled after mount.
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    setDecks(initialDecks);
  }, [initialDecks]);

  async function copy(deck: SharedDeck) {
    if (!origin) return;
    try {
      await navigator.clipboard.writeText(`${origin}/s/${deck.token}`);
      toast.success('Link copied');
    } catch {
      // The clipboard API is unavailable over plain http:// and in some in-app browsers.
      toast.error('Copy failed. Open the deck to copy its link by hand.');
    }
  }

  async function turnOff(deck: SharedDeck) {
    const index = decks.findIndex((row) => row.id === deck.id);
    setPending(deck.id);
    setDecks((rows) => rows.filter((row) => row.id !== deck.id));

    const result = await setDeckSharing({ deck_id: deck.id, enabled: false, rotate: false });
    setPending(null);

    if (!result?.success) {
      setDecks((rows) => (rows.some((row) => row.id === deck.id) ? rows : insertAt(rows, deck, index)));
      toast.error(formatActionError(result?.error, 'Could not turn the link off.'));
      return;
    }

    toast.success(`Link to ${deck.title} turned off`, {
      description: 'Anyone who has it can no longer open the deck.',
      action: {
        label: 'Undo',
        onClick: () => {
          void setDeckSharing({ deck_id: deck.id, enabled: true, rotate: false }).then((restored) => {
            if (!restored?.success) {
              toast.error(formatActionError(restored?.error, 'Could not turn the link back on.'));
              return;
            }
            const token = restored.shareToken ?? deck.token;
            setDecks((rows) => (rows.some((row) => row.id === deck.id) ? rows : insertAt(rows, { ...deck, token }, index)));
          });
        },
      },
    });
  }

  async function setListed(deck: SharedDeck, listed: boolean) {
    setPending(deck.id);
    setDecks((rows) => rows.map((row) => (row.id === deck.id ? { ...row, listed } : row)));
    const result = await setDeckListing({ deck_id: deck.id, listed });
    setPending(null);
    if (!('success' in result) || !result.success) {
      setDecks((rows) => rows.map((row) => (row.id === deck.id ? { ...row, listed: !listed } : row)));
      toast.error(formatActionError('error' in result ? result.error : null, 'Could not update the listing.'));
    }
  }

  if (decks.length === 0) {
    return (
      <p className="well px-4 py-6 text-center text-[13px] text-ink-dim">
        Nothing is shared. Share a deck from its page, and its link appears here.
      </p>
    );
  }

  return (
    <ul className="well px-3.5">
      {decks.map((deck) => (
        <li
          key={deck.id}
          className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border py-3 last:border-b-0"
        >
          <div className="min-w-0 flex-1">
            <Link href={`/dashboard/${deck.id}`} className={`block truncate text-sm text-ink ${LINK}`}>
              {deck.title}
            </Link>
            <p className="mt-0.5 text-[12px] text-ink-dim">
              Link on · {deck.sharedLabel}
              {deck.cloneCount > 0 ? (
                <>
                  {' · copied '}
                  <span className="font-mono tnum">{deck.cloneCount}</span> {deck.cloneCount === 1 ? 'time' : 'times'}
                </>
              ) : null}
            </p>
          </div>

          {exploreEnabled ? (
            <label className="flex items-center gap-2 text-[12px] text-ink-dim">
              <Switch
                checked={deck.listed}
                onCheckedChange={(listed) => void setListed(deck, listed)}
                disabled={pending === deck.id}
                aria-label={`List ${deck.title} on Explore`}
              />
              <span aria-hidden="true">Listed on Explore</span>
            </label>
          ) : null}

          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              size="sm"
              onClick={() => void copy(deck)}
              disabled={!origin}
              aria-label={`Copy the link to ${deck.title}`}
            >
              Copy link
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => void turnOff(deck)}
              disabled={pending === deck.id}
              aria-label={`Turn off the link to ${deck.title}`}
            >
              Turn off
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function insertAt(rows: SharedDeck[], deck: SharedDeck, index: number): SharedDeck[] {
  const at = index < 0 ? rows.length : Math.min(index, rows.length);
  return [...rows.slice(0, at), deck, ...rows.slice(at)];
}
