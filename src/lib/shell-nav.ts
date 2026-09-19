import 'server-only';
import { cache } from 'react';
import { getDueByDeck, getRequestClient } from '@/lib/supabase/session';
import { removeDeckTagFromTitle } from '@/lib/deck-tags';

/**
 * How many decks the rail's palette and breadcrumb can name. Past this the
 * breadcrumb falls back to "Deck" and the palette stops listing — both degrade
 * to something honest rather than to a blank.
 */
const PALETTE_DECK_CAP = 500;

export type ShellDeck = { id: string; title: string; dueCount: number };

export type ShellNav = {
  decks: ShellDeck[];
  totalDue: number;
  /** Where "start session" goes. Null when the account has no decks at all. */
  sessionHref: string | null;
};

/**
 * The reads behind the shell header's breadcrumb and command palette, once per
 * request. Each header slot calls this from its own Suspense boundary, and
 * `cache` makes the second call share the first's promise rather than repeat
 * the queries — so the header streams in as one piece, off one round-trip.
 */
export const loadShellNav = cache(async (userId: string): Promise<ShellNav> => {
  const supabase = await getRequestClient();

  const [deckResult, dueRows] = await Promise.all([
    supabase
      .from('decks')
      .select('id, title')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(PALETTE_DECK_CAP),
    getDueByDeck(userId),
  ]);

  const dueByDeck = new Map(dueRows.map((row) => [row.deck_id, row.due_count]));

  const decks: ShellDeck[] = (deckResult.data ?? []).map((deck) => ({
    id: deck.id,
    title: removeDeckTagFromTitle(deck.title),
    dueCount: dueByDeck.get(deck.id) ?? 0,
  }));

  const totalDue = decks.reduce((sum, deck) => sum + deck.dueCount, 0);
  const mostDue = decks.reduce<ShellDeck | null>(
    (best, deck) => (best === null || deck.dueCount > best.dueCount ? deck : best),
    null
  );

  /*
   * "Start session" has to go somewhere true. With work outstanding that is the
   * deck holding the most of it; with none it is study-ahead on the most
   * recently touched deck — the same fallback the due-now band uses. With no
   * decks at all the command is not offered, rather than offered and dead.
   */
  const sessionHref =
    mostDue && mostDue.dueCount > 0
      ? `/dashboard/${mostDue.id}/study`
      : decks[0]
        ? `/dashboard/${decks[0].id}/study?scope=include_reviewed`
        : null;

  return { decks, totalDue, sessionHref };
});
