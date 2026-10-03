'use client';

import { useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { ChevronsLeft, ChevronsRight, Plus, Search, X } from 'lucide-react';

import { Kbd } from '@/components/ui/Kbd';
import { Wordmark } from '@/components/ui/shared/Wordmark';
import { requestOpenCommandPalette, requestOpenCreateDeck } from '@/lib/dashboard-events';
import { sidebarMode } from '@/lib/sidebar-nav';
import { useModalDialog } from '@/lib/use-modal-dialog';

import { useSidebar } from './SidebarProvider';

/** The sidebar's id, for the header button's `aria-controls`. */
export const SIDEBAR_ID = 'app-sidebar';

type SidebarProps = {
  /** Server-rendered, streamed behind Suspense: Study, Library, or Settings' sections. */
  nav: React.ReactNode;
  /** Server-rendered, streamed behind Suspense: the account row. */
  account: React.ReactNode;
};

/**
 * The navigation sidebar (sidebar plan §6.2, NAV-02; design system §7.11).
 *
 * One element, three presentations, all decided by CSS (globals.css,
 * "Sidebar"): a 256px column, the 48px rail, or — below 768px — a drawer.
 * The frame renders at once; the nav and the account row stream in through
 * their slots, so the layout never waits on the database.
 *
 * As a drawer it is a modal dialog: `useModalDialog` gives it the scrim's
 * Escape, the Tab trap, the scroll lock and focus back to the header button.
 * As a column it is none of those things — it is part of the page.
 */
export function Sidebar({ nav, account }: SidebarProps) {
  const { setPreference, drawerOpen, closeDrawer } = useSidebar();
  // Settings swaps the sidebar for its own sections, as the approved board 2 shows; ⌘K and ⌘N still work there.
  const showActions = sidebarMode(usePathname()) === 'app';

  const dialogRef = useModalDialog({
    open: drawerOpen,
    onClose: closeDrawer,
    initialFocus: (dialog) => dialog.querySelector<HTMLElement>('[data-drawer-close]'),
  });

  /*
   * An action that opens a dialog, from inside the drawer: close the drawer
   * first. Two frames later its close has committed and handed focus back to
   * the header button, so the new dialog records that button as its opener
   * and returns focus there — not to an element inside a closed drawer.
   */
  const afterDrawer = useCallback(
    (action: () => void) => () => {
      if (!drawerOpen) {
        action();
        return;
      }
      closeDrawer();
      requestAnimationFrame(() => requestAnimationFrame(action));
    },
    [drawerOpen, closeDrawer],
  );

  return (
    <>
      {drawerOpen ? <div className="sidebar-scrim" aria-hidden="true" onClick={closeDrawer} /> : null}

      <div
        id={SIDEBAR_ID}
        ref={dialogRef}
        className="sidebar"
        data-open={drawerOpen}
        role={drawerOpen ? 'dialog' : undefined}
        aria-modal={drawerOpen || undefined}
        aria-label={drawerOpen ? 'Navigation' : undefined}
      >
        <div className="sidebar__head">
          <span className="sidebar__wordmark">
            <Wordmark href="/dashboard" size="sm" className="text-[24px]" />
          </span>
          <button
            type="button"
            className="sidebar__icon-btn sidebar__collapse"
            onClick={() => setPreference('collapsed')}
            aria-expanded="true"
            aria-controls={SIDEBAR_ID}
            aria-label="Collapse navigation"
            title="Collapse navigation"
          >
            <ChevronsLeft className="size-[15px]" strokeWidth={1.5} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="sidebar__icon-btn sidebar__expand"
            onClick={() => setPreference('expanded')}
            aria-expanded="false"
            aria-controls={SIDEBAR_ID}
            aria-label="Expand navigation"
            title="Expand navigation"
          >
            <ChevronsRight className="size-[15px]" strokeWidth={1.5} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="sidebar__icon-btn sidebar__close"
            data-drawer-close
            onClick={closeDrawer}
            aria-label="Close navigation"
          >
            <X className="size-[18px]" strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>

        {showActions ? (
          <>
            <button
              type="button"
              className="sidebar__search"
              onClick={afterDrawer(requestOpenCommandPalette)}
              aria-haspopup="dialog"
              aria-keyshortcuts="Meta+K Control+K"
              title="Search (⌘K)"
            >
              <Search className="size-[14px] shrink-0" strokeWidth={1.5} aria-hidden="true" />
              <span className="sidebar__label">Search</span>
              <Kbd className="sidebar__kbd">⌘K</Kbd>
            </button>

            <button
              type="button"
              className="sidebar__item mt-1.5"
              onClick={afterDrawer(requestOpenCreateDeck)}
              aria-haspopup="dialog"
              aria-keyshortcuts="Meta+N Control+N"
              title="New deck (⌘N)"
            >
              <Plus className="size-[15px] shrink-0" strokeWidth={1.5} aria-hidden="true" />
              <span className="sidebar__label">New deck</span>
              <Kbd className="sidebar__kbd">⌘N</Kbd>
            </button>
          </>
        ) : null}

        <div className="sidebar__scroll mt-3.5">{nav}</div>

        <div className="sidebar__foot">{account}</div>
      </div>
    </>
  );
}

/**
 * The header's button for the phone drawer (sidebar plan §6.5). Hidden from
 * 768px, where the sidebar is a column. Its mark is the deck-index miniature,
 * the same three rules as Today's (§6, Rev. E) — not a hamburger glyph.
 */
export function SidebarToggle() {
  const { drawerOpen, openDrawer } = useSidebar();

  return (
    <button
      type="button"
      onClick={openDrawer}
      aria-label="Open navigation"
      aria-expanded={drawerOpen}
      aria-controls={SIDEBAR_ID}
      className="inline-flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-ink outline-hidden transition-colors duration-[120ms] hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] md:hidden"
    >
      <span className="sidebar__mark sidebar__mark--today" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    </button>
  );
}
