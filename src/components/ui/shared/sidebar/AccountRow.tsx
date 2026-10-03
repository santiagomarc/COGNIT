'use client';

import { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Settings } from 'lucide-react';

import { useModalDialog } from '@/lib/use-modal-dialog';

import { AccountMenuContent } from './AccountMenuContent';
import { useSidebar } from './SidebarProvider';

type AccountRowProps = {
  /** The resolved display name; null while it streams in, or when nothing honest exists. */
  name: string | null;
  email: string | null;
};

type Anchor = { left: number; bottom: number };

/**
 * The sidebar's foot (sidebar plan §6.6, NAV-06): the account button and the
 * settings link beside it.
 *
 * On desktop the menu is a popover that opens beside the sidebar, so the
 * list stays visible. It is portalled to <body>: the sidebar is a size
 * container, which makes it the containing block for fixed descendants, and
 * a menu positioned inside it would be clipped to the column.
 *
 * In the phone drawer the menu opens inline above the row instead — the
 * drawer is already a modal dialog, and a modal inside a modal would fight it
 * over Escape and the Tab trap (design system §8, Rev. E).
 */
export function AccountRow({ name, email }: AccountRowProps) {
  const { drawerOpen } = useSidebar();
  /*
   * Which presentation the menu was opened in. It belongs to that one: when
   * the drawer opens or closes, the menu closes, rather than an inline panel
   * in a closing drawer turning into a popover that grabs focus.
   */
  const [openedIn, setOpenedIn] = useState<'popover' | 'inline' | null>(null);
  const [drawerWas, setDrawerWas] = useState(drawerOpen);
  if (drawerWas !== drawerOpen) {
    setDrawerWas(drawerOpen);
    setOpenedIn(null);
  }
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const open = openedIn !== null;
  const popoverOpen = openedIn === 'popover' && anchor !== null;
  const inlineOpen = openedIn === 'inline';

  const close = useCallback(() => setOpenedIn(null), []);
  const dialogRef = useModalDialog({ open: popoverOpen, onClose: close });

  const toggle = () => {
    if (open) {
      setOpenedIn(null);
      return;
    }
    if (drawerOpen) {
      setOpenedIn('inline');
      return;
    }
    // Measured on the click, so no effect has to write layout into state.
    const button = buttonRef.current;
    if (button) {
      const row = button.getBoundingClientRect();
      const column = button.closest('.sidebar')?.getBoundingClientRect() ?? row;
      setAnchor({ left: Math.round(column.right + 8), bottom: Math.round(window.innerHeight - row.bottom) });
    }
    setOpenedIn('popover');
  };

  const display = name ?? email ?? 'Your account';
  const initial = (name ?? email ?? '?').trim().charAt(0).toUpperCase() || '?';

  return (
    <>
      {inlineOpen ? (
        <div
          id="account-menu-inline"
          className="mb-2 rounded-[var(--radius-lg)] border border-border bg-[var(--bg)] p-1"
        >
          <AccountMenuContent name={name} email={email} onClose={close} titleId="account-menu-inline-title" />
        </div>
      ) : null}

      <div className="sidebar__account">
        <button
          ref={buttonRef}
          type="button"
          className="sidebar__item sidebar__item--account min-w-0 flex-1"
          onClick={toggle}
          aria-haspopup={drawerOpen ? undefined : 'dialog'}
          aria-expanded={open}
          aria-controls={inlineOpen ? 'account-menu-inline' : undefined}
          title="Account"
        >
          <span
            aria-hidden="true"
            className="flex size-[26px] shrink-0 items-center justify-center rounded-full border border-[var(--border-control)] font-mono text-[11px] text-ink"
          >
            {initial}
          </span>
          <span className="sidebar__label flex flex-col">
            <span className="truncate text-[13px] font-medium text-ink">{display}</span>
            <span className="truncate text-[11px] font-normal text-ink-dimmer">Account</span>
          </span>
        </button>
        <Link href="/dashboard/settings" className="sidebar__item sidebar__item--icon" aria-label="Settings" title="Settings">
          <Settings className="size-[15px]" strokeWidth={1.5} aria-hidden="true" />
        </Link>
      </div>

      {popoverOpen && anchor
        ? createPortal(
            <div className="fixed inset-0 z-[var(--z-modal)]">
              {/* Transparent: the page stays visible, and a click anywhere outside closes the menu. */}
              <div className="absolute inset-0" aria-hidden="true" onClick={close} />
              <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="account-menu-title"
                className="absolute w-[280px] rounded-[var(--radius-lg)] border border-[var(--border-strong)] bg-surface p-1 shadow-[var(--elevate-2)]"
                style={{ left: anchor.left, bottom: anchor.bottom }}
              >
                <AccountMenuContent name={name} email={email} onClose={close} titleId="account-menu-title" />
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
