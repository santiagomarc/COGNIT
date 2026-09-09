import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { AccountControl } from '@/components/ui/shared/AccountControl';
import { AppRail } from '@/components/ui/shared/AppRail';
import { Breadcrumb } from '@/components/ui/shared/Breadcrumb';
import { CommandPalette } from '@/components/ui/shared/CommandPalette';
import { CreateDeckModal } from '@/components/ui/shared/CreateDeckModal';
import { loadDueByDeckRows } from '@/lib/dashboard-due';
import { removeDeckTagFromTitle } from '@/lib/deck-tags';

/**
 * How many decks the rail's palette and breadcrumb can name. Past this the
 * breadcrumb falls back to "Deck" and the palette stops listing — both degrade
 * to something honest rather than to a blank.
 */
const PALETTE_DECK_CAP = 500;

/**
 * Chromed routes — the deck index and deck detail (design system §8).
 *
 * The chrome is: a 48px rail on the left, a header carrying the breadcrumb and
 * the `⌘K` trigger, and the two dialogs those triggers open. What it is *not*
 * is a floating bar: the rail is a column in this flex row, so nothing here
 * ever sits on top of the page, and no page below has to reserve space for it.
 *
 * Being a route group rather than a `usePathname()` test is the whole point.
 * Study and quiz resolve into `(focus)` instead and cannot pick this up by
 * accident — which is what let the old dock keep a Dashboard link on a paused
 * quiz that bypassed `requestQuit()` (F-01).
 *
 * The two dialogs are mounted here rather than on the page so every chromed
 * route can reach them. That also repairs a real gap: `CreateDeckModal` used to
 * be rendered inside the due-now band, which is not rendered when the account
 * has no decks — so the onboarding panel's "write your own" dispatched its
 * open event at a component that was not mounted.
 */
export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const [deckResult, dueRows] = await Promise.all([
    supabase
      .from('decks')
      .select('id, title')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(PALETTE_DECK_CAP),
    loadDueByDeckRows(supabase, user.id, new Date().toISOString()),
  ]);

  const dueByDeck = new Map(dueRows.map((row) => [row.deck_id, row.due_count]));

  const decks = (deckResult.data ?? []).map((deck) => ({
    id: deck.id,
    title: removeDeckTagFromTitle(deck.title),
    dueCount: dueByDeck.get(deck.id) ?? 0,
  }));

  const totalDue = decks.reduce((sum, deck) => sum + deck.dueCount, 0);
  const mostDue = decks.reduce<(typeof decks)[number] | null>(
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

  return (
    <div className="flex min-h-dvh">
      <AppRail email={user.email ?? null} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-[var(--z-sticky)] border-b border-border bg-[var(--bg)]">
          <div className="flex h-12 items-center justify-between gap-4 px-4 md:px-6">
            <Breadcrumb decks={decks} />

            <div className="flex shrink-0 items-center gap-2">
              <CommandPalette decks={decks} sessionHref={sessionHref} totalDue={totalDue} />
              {/* Desktop keeps the account in the rail foot (§8); this is the
                  mobile anchor for the same sheet. */}
              <div className="md:hidden">
                <AccountControl email={user.email ?? null} placement="header" />
              </div>
            </div>
          </div>
        </header>

        <div id="main-content" role="main" className="min-w-0 flex-1">
          {children}
        </div>
      </div>

      {/* Mounted once for the whole chromed subtree; opened by the palette, the
          due-now band and the onboarding panel through a named event. */}
      <CreateDeckModal />
    </div>
  );
}
