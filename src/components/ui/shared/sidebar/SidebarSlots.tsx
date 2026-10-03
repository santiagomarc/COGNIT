import { resolveDisplayName } from '@/lib/display-name';
import { loadSidebar } from '@/lib/shell-nav';
import { buildSidebarItems, sidebarDecks } from '@/lib/sidebar-nav';
import type { SessionUser } from '@/lib/supabase/session';

import { AccountRow } from './AccountRow';
import { SidebarNav } from './SidebarNav';

/**
 * The sidebar's two streamed slots (sidebar plan §6.3, NAV-03). Both await
 * the same cached `loadSidebar`, so they share one wave of reads, and Today's
 * own `getDueByDeck` / `getDueDrills` calls reuse it within the request.
 *
 * The fallbacks draw the same components with nothing loaded — every item
 * present, no badges, skeleton deck rows — so the frame never changes shape
 * when the data lands.
 */

export async function SidebarNavSlot({ userId, exploreEnabled }: { userId: string; exploreEnabled: boolean }) {
  const data = await loadSidebar(userId);
  const { shown, hiddenCount } = sidebarDecks(data.decks);
  return (
    <SidebarNav
      items={buildSidebarItems({ counts: data.counts, exploreEnabled })}
      decks={{ shown, hiddenCount, total: data.decks.length }}
    />
  );
}

export function SidebarNavFallback({ exploreEnabled }: { exploreEnabled: boolean }) {
  return <SidebarNav items={buildSidebarItems({ counts: null, exploreEnabled })} decks={null} />;
}

export async function AccountRowSlot({ user }: { user: SessionUser }) {
  const { settings } = await loadSidebar(user.id);
  return <AccountRow name={resolveDisplayName(user, settings.displayName)} email={user.email} />;
}
