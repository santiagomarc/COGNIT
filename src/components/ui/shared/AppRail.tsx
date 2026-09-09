'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronsLeft, ChevronsRight, Search } from 'lucide-react';

import { AccountControl } from '@/components/ui/shared/AccountControl';
import { requestOpenCommandPalette } from '@/lib/dashboard-events';

type AppRailProps = {
  /** Shown in the account sheet so "sign out" says what it is signing out of. */
  email: string | null;
};

/**
 * The 48px navigation rail (design system §8, task 8.2).
 *
 * It replaces the floating dock, which was a fixed bar that covered content on
 * every screen in order to offer two live destinations — its other two slots
 * were permanently `disabled` placeholders pointing at `/dashboard/stats` and
 * `/dashboard/profile`, routes that do not exist (F-04).
 *
 * Three properties are the point:
 *
 *  1. **It occupies a column rather than floating.** Expanding widens the
 *     column and reflows the page beside it; nothing is ever underneath it, so
 *     no page has to reserve clearance for it (F-03).
 *  2. **Every destination is real.** Deck index, search, account. Nothing here
 *     is a placeholder for a route that has not been built.
 *  3. **It is desktop-only.** Mobile gets a header breadcrumb and the account
 *     sheet — and no bottom bar of any kind, so the study route's grade deck
 *     has nothing floating above it.
 *
 * Collapsed is the default state and is not persisted: §8 specifies the
 * collapsed rail as the resting state, and restoring an expanded one from
 * storage would reflow the page after hydration on every cold load.
 */
export function AppRail({ email }: AppRailProps) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);
  const onIndex = pathname === '/dashboard';
  // A chevron is inside §6's allowlist; a panel glyph is not.
  const ExpandIcon = expanded ? ChevronsLeft : ChevronsRight;

  return (
    <nav
      aria-label="Primary"
      data-expanded={expanded}
      className="rail sticky top-0 z-[var(--z-rail)] hidden h-dvh shrink-0 flex-col gap-1 self-start p-[9px] md:flex"
    >
      <Link
        href="/dashboard"
        className="rail__btn"
        aria-current={onIndex ? 'page' : undefined}
        title="Decks"
      >
        {/*
         * §6's icon allowlist has no glyph for "index", and inventing a
         * metaphor for it is exactly what the allowlist exists to prevent — so
         * the mark is a three-rule miniature of the deck index itself (§7.5).
         */}
        <span className="rail__rows" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <span className="rail__label">Decks</span>
      </Link>

      <button
        type="button"
        onClick={requestOpenCommandPalette}
        className="rail__btn"
        title="Search (⌘K)"
        aria-haspopup="dialog"
      >
        <Search className="h-[15px] w-[15px] shrink-0" strokeWidth={1.5} aria-hidden="true" />
        <span className="rail__label">Search</span>
      </button>

      <div className="flex-1" />

      <AccountControl email={email} />

      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="rail__btn"
        aria-expanded={expanded}
        aria-label={expanded ? 'Collapse navigation' : 'Expand navigation'}
        title={expanded ? 'Collapse navigation' : 'Expand navigation'}
      >
        <ExpandIcon className="h-[15px] w-[15px] shrink-0" strokeWidth={1.5} aria-hidden="true" />
        <span className="rail__label">Collapse</span>
      </button>
    </nav>
  );
}
