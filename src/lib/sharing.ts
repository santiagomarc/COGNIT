import 'server-only';

import type { createClient } from '@/lib/supabase/server';
import { removeDeckTagFromTitle } from '@/lib/deck-tags';
import { logger } from '@/lib/logger';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type SharedDeck = {
  id: string;
  title: string;
  token: string;
  /** "shared today", "shared 3 days ago" — computed on the server so it never mismatches on hydration. */
  sharedLabel: string;
  listed: boolean;
  cloneCount: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** How long a link has been on, in words. Dates are time, not memory: callers render it in ink. */
export function sharedAgo(sharedAt: string | null, now: Date): string {
  if (!sharedAt) return 'shared';
  const at = Date.parse(sharedAt);
  if (Number.isNaN(at)) return 'shared';
  const days = Math.max(0, Math.floor((now.getTime() - at) / DAY_MS));
  if (days === 0) return 'shared today';
  if (days === 1) return 'shared yesterday';
  return `shared ${days} days ago`;
}

/**
 * The caller's shared decks, newest link first (sidebar plan §4.3, DST-02).
 *
 * The `user_id` filter is not redundant. The sharing SELECT policy
 * (202609070910) lets ANY caller read ANY deck with `is_public` and a token —
 * that is how `/s/<token>` works — so without it this list would include
 * every shared deck in the product. sharing.test.ts pins it.
 */
export async function loadSharedDecks(supabase: SupabaseServerClient, userId: string, now: Date): Promise<SharedDeck[]> {
  const { data, error } = await supabase
    .from('decks')
    .select('id, title, share_token, shared_at, listed_at, clone_count')
    .eq('user_id', userId)
    .eq('is_public', true)
    .not('share_token', 'is', null)
    .order('shared_at', { ascending: false });

  if (error) {
    logger.error('sharing', 'shared decks read failed', { message: error.message });
    return [];
  }

  return (data ?? []).flatMap((deck) =>
    deck.share_token
      ? [{
          id: deck.id,
          title: removeDeckTagFromTitle(deck.title),
          token: deck.share_token,
          sharedLabel: sharedAgo(deck.shared_at, now),
          listed: deck.listed_at !== null,
          cloneCount: deck.clone_count ?? 0,
        }]
      : [],
  );
}
