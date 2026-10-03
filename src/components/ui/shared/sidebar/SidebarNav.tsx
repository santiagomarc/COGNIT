'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';

import {
  SETTINGS_SECTIONS,
  activeDeckId,
  activeSidebarItem,
  sidebarMode,
  type SettingsSectionId,
  type SidebarDeck,
  type SidebarItem,
  type SidebarItemId,
} from '@/lib/sidebar-nav';

import { useSidebar } from './SidebarProvider';

const GROUP_LABEL =
  'sidebar__group-label flex items-baseline justify-between px-[9px] pb-1 font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer';

export type SidebarDeckList = {
  shown: SidebarDeck[];
  hiddenCount: number;
  total: number;
};

type SidebarNavProps = {
  items: SidebarItem[];
  /** Null while the shell's reads are still streaming. */
  decks: SidebarDeckList | null;
};

/**
 * What the sidebar lists (sidebar plan §6.4, NAV-04): Study and Library
 * everywhere, Settings' own sections on /dashboard/settings. The model —
 * order, badges, which item is current — is `src/lib/sidebar-nav.ts`, which
 * is unit-tested; this file only draws it.
 */
export function SidebarNav({ items, decks }: SidebarNavProps) {
  const pathname = usePathname();
  return sidebarMode(pathname) === 'settings' ? (
    <SettingsSectionsNav />
  ) : (
    <AppNav items={items} decks={decks} pathname={pathname} />
  );
}

function AppNav({ items, decks, pathname }: SidebarNavProps & { pathname: string }) {
  const current = activeSidebarItem(pathname);
  const currentDeck = activeDeckId(pathname);
  const study = items.filter((item) => item.group === 'study');
  const library = items.filter((item) => item.group === 'library');

  return (
    <nav aria-label="Primary">
      <div className="sidebar__group">
        <p className={GROUP_LABEL}>Study</p>
        <ul className="flex flex-col gap-0.5">
          {study.map((item) => (
            <li key={item.id}>
              <NavItem item={item} current={current === item.id} />
            </li>
          ))}
        </ul>
      </div>

      <div className="sidebar__group mt-4">
        <p className={GROUP_LABEL}>
          <span>Library</span>
          {decks && decks.total > 0 ? (
            <span className="tnum">
              {decks.total} {decks.total === 1 ? 'deck' : 'decks'}
            </span>
          ) : null}
        </p>

        <ul className="sidebar__decks flex flex-col gap-0.5" aria-label="Your decks">
          {decks === null ? (
            Array.from({ length: 4 }).map((_, index) => (
              <li key={index} className="flex h-7 items-center gap-2.5 pl-[15px] pr-[9px]" aria-hidden="true">
                <span className="glass-skeleton block h-3 w-[2px] rounded-[1px]" />
                <span className="glass-skeleton block h-3 flex-1 rounded-sm" />
              </li>
            ))
          ) : decks.total === 0 ? (
            <li className="px-[9px] py-1 text-[13px] text-ink-dim">No decks yet</li>
          ) : (
            <>
              {decks.shown.map((deck) => (
                <li key={deck.id}>
                  <Link
                    href={`/dashboard/${deck.id}`}
                    className="sidebar__deck"
                    aria-current={currentDeck === deck.id ? 'page' : undefined}
                  >
                    <span className="sidebar__tick" data-due={deck.dueCount > 0} aria-hidden="true" />
                    <span className="sidebar__label">{deck.title}</span>
                    {deck.dueCount > 0 ? (
                      <span className="sidebar__count" data-tone="due">
                        {deck.dueCount > 999 ? '999+' : deck.dueCount}
                        <span className="sr-only"> due</span>
                      </span>
                    ) : null}
                  </Link>
                </li>
              ))}
              {decks.hiddenCount > 0 ? (
                <li>
                  <Link href="/dashboard#deck-collection" className="sidebar__deck">
                    <span className="sidebar__label">
                      All <span className="font-mono tnum">{decks.total}</span> decks
                    </span>
                  </Link>
                </li>
              ) : null}
            </>
          )}
        </ul>

        <ul className="mt-1.5 flex flex-col gap-0.5">
          {library.map((item) => (
            <li key={item.id}>
              <NavItem item={item} current={current === item.id} />
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

function NavItem({ item, current }: { item: SidebarItem; current: boolean }) {
  return (
    <Link href={item.href} className="sidebar__item" aria-current={current ? 'page' : undefined} title={item.label}>
      <Mark id={item.id} />
      <span className="sidebar__label">
        {item.label}
        {/* The badge as words, so "Today, 47 due" is read in the rail too, where the number is hidden. */}
        {item.countLabel ? <span className="sr-only">, {item.countLabel}</span> : null}
      </span>
      {item.count ? (
        <span className="sidebar__count" data-tone={item.tone} aria-hidden="true">
          {item.count}
        </span>
      ) : null}
    </Link>
  );
}

/** The destination marks (design system §6, Rev. E): CSS miniatures, and Lucide where §6 has a glyph. */
function Mark({ id }: { id: SidebarItemId }) {
  switch (id) {
    case 'today':
      return (
        <span className="sidebar__mark sidebar__mark--today" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      );
    case 'stats':
      return (
        <span className="sidebar__mark sidebar__mark--stats" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      );
    case 'drills':
      return (
        <span className="sidebar__mark sidebar__mark--drills" aria-hidden="true">
          <span />
        </span>
      );
    case 'explore':
      return (
        <span className="sidebar__mark sidebar__mark--explore" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </span>
      );
    case 'trash':
      return (
        <span className="sidebar__mark sidebar__mark--trash" aria-hidden="true">
          <span />
        </span>
      );
    case 'shared':
      return <ArrowUpRight className="size-[15px] shrink-0" strokeWidth={1.5} aria-hidden="true" />;
  }
}

// ── Settings mode (sidebar plan §6.4) ────────────────────────────────

const SECTION_GROUPS = SETTINGS_SECTIONS.reduce<Array<{ group: string; sections: (typeof SETTINGS_SECTIONS)[number][] }>>(
  (groups, section) => {
    const last = groups.at(-1);
    if (last && last.group === section.group) last.sections.push(section);
    else groups.push({ group: section.group, sections: [section] });
    return groups;
  },
  [],
);

function SettingsSectionsNav() {
  const { closeDrawer } = useSidebar();
  const active = useActiveSection();

  return (
    <nav aria-label="Settings">
      <Link href="/dashboard" className="sidebar__item" title="Back to Cognit">
        <ArrowLeft className="size-[15px] shrink-0" strokeWidth={1.5} aria-hidden="true" />
        <span className="sidebar__label">Back to Cognit</span>
      </Link>

      <p className="sidebar__heading px-[9px] pb-3 pt-4 font-serif text-[24px] leading-none tracking-[-0.02em] text-ink">
        Settings
      </p>

      <div className="sidebar__sections flex flex-col gap-3">
        {SECTION_GROUPS.map((group) => (
          <div key={group.group}>
            <p className={GROUP_LABEL}>{group.group}</p>
            <ul className="flex flex-col gap-0.5">
              {group.sections.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="sidebar__item"
                    aria-current={active === section.id ? 'location' : undefined}
                    // A hash link does not change the route, so the drawer would stay over the page.
                    onClick={closeDrawer}
                  >
                    <span className="sidebar__label">{section.label}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}

/** Where a section counts as "current": just below the sticky 48px header, with some slack. */
const SECTION_LINE = 96;

/**
 * The current section: the last one whose top has passed just below the
 * sticky header, or the last section once the page is scrolled to its end
 * (the final sections are too short to ever reach the line).
 *
 * Read from the sections' positions on scroll, one frame at a time. An
 * IntersectionObserver band read the section above as current for as long as
 * its bottom edge touched the band. The page's content can also stream in
 * after the sidebar mounts (its loading.tsx paints first), so a mutation on
 * the main region recomputes too.
 */
function useActiveSection(): SettingsSectionId | null {
  const [active, setActive] = useState<SettingsSectionId | null>(null);

  useEffect(() => {
    let frame = 0;

    const compute = () => {
      frame = 0;
      const present = SETTINGS_SECTIONS.filter((section) => document.getElementById(section.id));
      if (present.length === 0) return;

      const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      let current = present[0].id;
      if (atEnd) {
        current = present[present.length - 1].id;
      } else {
        for (const section of present) {
          const top = document.getElementById(section.id)?.getBoundingClientRect().top ?? Infinity;
          if (top <= SECTION_LINE) current = section.id;
          else break;
        }
      }
      setActive(current);
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(compute);
    };

    schedule();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    const main = document.getElementById('main-content');
    const mutation = main ? new MutationObserver(schedule) : null;
    mutation?.observe(main as HTMLElement, { childList: true, subtree: true });

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      mutation?.disconnect();
    };
  }, []);

  return active;
}
