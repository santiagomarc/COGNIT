import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { getSessionUser } from '@/lib/supabase/session';
import { SIDEBAR_COOKIE, parseSidebarPreference } from '@/lib/sidebar-nav';
import { AmbientField } from '@/components/ui/shared/AmbientField';
import { CreateDeckModal } from '@/components/ui/shared/CreateDeckModal';
import { KeyboardShortcutsDialog } from '@/components/ui/shared/KeyboardShortcutsDialog';
import { ShellBreadcrumb, ShellBreadcrumbFallback, ShellCommandPalette } from '@/components/ui/shared/ShellNav';
import { AccountRow } from '@/components/ui/shared/sidebar/AccountRow';
import { Sidebar, SidebarToggle } from '@/components/ui/shared/sidebar/Sidebar';
import { SidebarProvider } from '@/components/ui/shared/sidebar/SidebarProvider';
import { AccountRowSlot, SidebarNavFallback, SidebarNavSlot } from '@/components/ui/shared/sidebar/SidebarSlots';

/**
 * Chromed routes — Today, decks, Drills, Shared, Trash, Statistics, Settings
 * (design system §8, Rev. E; COGNIT_SIDEBAR_SETTINGS_PLAN.md §6).
 *
 * The chrome is the sidebar, a header carrying the breadcrumb (and, on a
 * phone, the button that opens the sidebar as a drawer), and the dialogs the
 * sidebar and the keyboard open. What it is *not* is a floating bar: from
 * 768px the sidebar is a column in this flex row, so nothing here sits on top
 * of the page and no page below has to reserve space for it. There is no
 * header search any more; Search lives in the sidebar and opens ⌘K.
 *
 * Being a route group rather than a `usePathname()` test is the whole point.
 * Study, quiz and drills resolve into `(focus)` instead and cannot pick this
 * up by accident — which is what let the old dock keep a Dashboard link on a
 * paused quiz that bypassed `requestQuit()` (F-01).
 *
 * The layout waits for exactly one thing before the frame goes out: the
 * session, which `getSessionUser` verifies from the cookie — locally once the
 * project signs with ES256, by an Auth round-trip while it is still HS256
 * (plan §6.3). The sidebar preference comes from a cookie, read here so the
 * first paint is already the right width. Everything that needs the database
 * — the sidebar's lists and counts, the account name, the breadcrumb's deck
 * title, the palette — streams behind its own Suspense boundary, off one
 * cached wave of reads (`loadSidebar`), so the frame, the header and the
 * page's own skeleton reach the browser on the first flush.
 *
 * The dialogs are mounted here rather than on a page so every chromed route
 * can reach them, and so ⌘N and ? are honoured wherever their keycaps show.
 */
export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();

  if (!user) {
    redirect('/login');
  }

  const preference = parseSidebarPreference((await cookies()).get(SIDEBAR_COOKIE)?.value);
  // Read at request time: /explore is notFound() without it, so the sidebar must not link there (D10).
  const exploreEnabled = process.env.EXPLORE_ENABLED === 'true';

  return (
    <SidebarProvider initialPreference={preference}>
      {/*
        Mounted once for the whole chromed subtree, and deliberately not in the
        root layout: `(focus)` — study and quiz — is a single card on a flat
        ground and must stay that way (§8). The sidebar and header already carry
        --z-rail / --z-sticky, so only #main-content needs lifting off z-0.
      */}
      <AmbientField />

      <Sidebar
        nav={
          <Suspense fallback={<SidebarNavFallback exploreEnabled={exploreEnabled} />}>
            <SidebarNavSlot userId={user.id} exploreEnabled={exploreEnabled} />
          </Suspense>
        }
        account={
          <Suspense fallback={<AccountRow name={null} email={user.email} />}>
            <AccountRowSlot user={user} />
          </Suspense>
        }
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-[var(--z-sticky)] border-b border-border bg-[var(--bg)]">
          <div className="flex h-12 items-center gap-1 px-2 md:px-6">
            <SidebarToggle />
            <Suspense fallback={<ShellBreadcrumbFallback />}>
              <ShellBreadcrumb userId={user.id} />
            </Suspense>
          </div>
        </header>

        <div id="main-content" role="main" className="relative z-[1] min-w-0 flex-1">
          {children}
        </div>
      </div>

      {/* Opened by the sidebar's New deck, ⌘N, the due-now band, the onboarding panel and the palette. */}
      <CreateDeckModal />
      {/* `?`, the account menu and the palette's "Keyboard shortcuts" row (sidebar plan §5.7). */}
      <KeyboardShortcutsDialog />
      {/* Headless: the sidebar's Search and ⌘K open it (sidebar plan §6.8). */}
      <Suspense fallback={null}>
        <ShellCommandPalette userId={user.id} />
      </Suspense>
    </SidebarProvider>
  );
}
