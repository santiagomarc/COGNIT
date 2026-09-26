'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { setDeckListing } from '@/app/actions/deck-lifecycle';
import { formatActionError } from '@/lib/ai-feedback';

/**
 * Sharing by link and listing publicly are separate consents (plan §4.1d).
 * Rendered beside ShareDeckButton, and only once the deck has a share link.
 */
export function DeckListingToggle({ deckId, initialListedAt }: { deckId: string; initialListedAt: string | null }) {
  const [listed, setListed] = useState(initialListedAt !== null);
  const [isPending, startTransition] = useTransition();

  const toggle = (next: boolean) => startTransition(async () => {
    const result = await setDeckListing({ deck_id: deckId, listed: next });
    if (!('success' in result) || !result.success) {
      toast.error(formatActionError('error' in result ? result.error : null, 'Could not update the listing.'));
      return;
    }
    setListed(next);
    toast.success(next ? 'Listed in the public directory' : 'Removed from the public directory');
  });

  return (
    <label className="inline-flex min-h-[44px] items-center gap-2 text-[13px] text-ink-dim sm:min-h-0">
      <input
        type="checkbox"
        checked={listed}
        disabled={isPending}
        onChange={(event) => toggle(event.target.checked)}
        className="h-4 w-4 accent-[var(--ink)]"
      />
      List in the public directory
    </label>
  );
}
