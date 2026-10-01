import 'server-only';
import { cache } from 'react';
import { getDueByDeck, getDueDrills, getRequestClient, getUserSettings } from '@/lib/supabase/session';
import { removeDeckTagFromTitle } from '@/lib/deck-tags';
import { logger } from '@/lib/logger';
import type { SidebarCounts } from '@/lib/sidebar-nav';
import type { UserSettings } from '@/lib/user-settings';

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

// ── The sidebar (sidebar plan §6.3, NAV-03) ─────────────────────────

export type SidebarData = ShellNav & {
  counts: SidebarCounts;
  settings: UserSettings;
};

/**
 * Everything the sidebar's streamed slots need, off one cached promise: the
 * shell nav (decks, due), due drills, the trash/shared counts and the
 * settings. One wave of reads, behind the sidebar's Suspense boundaries, so
 * the frame still goes out on the first flush.
 */
export const loadSidebar = cache(async (userId: string): Promise<SidebarData> => {
  const supabase = await getRequestClient();

  const [nav, drills, countsResult, settings] = await Promise.all([
    loadShellNav(userId),
    getDueDrills(userId),
    supabase.rpc('get_sidebar_counts'),
    getUserSettings(userId),
  ]);

  if (countsResult.error) {
    logger.error('sidebar', 'get_sidebar_counts failed', { message: countsResult.error.message });
  }
  const countRow = countsResult.data?.[0];

  return {
    ...nav,
    settings,
    counts: {
      due: nav.totalDue,
      drillsDue: drills.total,
      drillsTruncated: drills.truncated,
      shared: countRow?.shared_count ?? 0,
      trashed: countRow?.trashed_count ?? 0,
    },
  };
});
