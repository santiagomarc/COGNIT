import { Suspense } from 'react';
import { redirect } from 'next/navigation';

import { getSessionUser } from '@/lib/supabase/session';
import { AccountControl } from '@/components/ui/shared/AccountControl';
import { AmbientField } from '@/components/ui/shared/AmbientField';
import { AppRail } from '@/components/ui/shared/AppRail';
import { CreateDeckModal } from '@/components/ui/shared/CreateDeckModal';
import {
  ShellBreadcrumb,
  ShellBreadcrumbFallback,
  ShellCommandPalette,
  ShellCommandPaletteFallback,
} from '@/components/ui/shared/ShellNav';

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
 * The layout waits for exactly one thing before the frame goes out: the
 * session, which `getSessionUser` verifies locally from the cookie. The deck
 * list the breadcrumb and palette need is read behind the two Suspense
 * boundaries in the header, so the rail, the header bar and the page's own
 * skeleton reach the browser on the first flush and the titles stream in
 * after. Reading it up here used to hold back the entire response — skeleton
 * included — for the layout's queries.
 *
 * The two dialogs are mounted here rather than on the page so every chromed
 * route can reach them. That also repairs a real gap: `CreateDeckModal` used to
 * be rendered inside the due-now band, which is not rendered when the account
 * has no decks — so the onboarding panel's "write your own" dispatched its
 * open event at a component that was not mounted.
 */
export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="flex min-h-dvh">
      {/*
        Mounted once for the whole chromed subtree, and deliberately not in the
        root layout: `(focus)` — study and quiz — is a single card on a flat
        ground and must stay that way (§8). The rail and header already carry
        --z-rail / --z-sticky, so only #main-content needs lifting off z-0.
      */}
      <AmbientField />

      <AppRail email={user.email} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-[var(--z-sticky)] border-b border-border bg-[var(--bg)]">
          <div className="flex h-12 items-center justify-between gap-4 px-4 md:px-6">
            <Suspense fallback={<ShellBreadcrumbFallback />}>
              <ShellBreadcrumb userId={user.id} />
            </Suspense>

            <div className="flex shrink-0 items-center gap-2">
              <Suspense fallback={<ShellCommandPaletteFallback />}>
                <ShellCommandPalette userId={user.id} />
              </Suspense>
              {/* Desktop keeps the account in the rail foot (§8); this is the
                  mobile anchor for the same sheet. */}
              <div className="md:hidden">
                <AccountControl email={user.email} placement="header" />
              </div>
            </div>
          </div>
        </header>

        <div id="main-content" role="main" className="relative z-[1] min-w-0 flex-1">
          {children}
        </div>
      </div>

      {/* Mounted once for the whole chromed subtree; opened by the palette, the
          due-now band and the onboarding panel through a named event. */}
      <CreateDeckModal />
    </div>
  );
}
