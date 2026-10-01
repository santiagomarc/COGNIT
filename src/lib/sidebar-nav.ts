/**
 * The sidebar's model (sidebar plan §6.4, NAV-04): which destinations exist,
 * what each counts, which is current, and which decks the Library lists.
 *
 * Pure and framework-free so every rule here is unit-tested; `Sidebar.tsx`
 * only renders what this returns. The breadcrumb reads the same segment map,
 * so a new named route is added in one place.
 */

// ── Routes ───────────────────────────────────────────────────────────

/** Named routes under /dashboard. Any other first segment is a deck id. */
export const NAMED_DASHBOARD_SEGMENTS = {
  stats: 'Statistics',
  drills: 'Drills',
  shared: 'Shared',
  trash: 'Trash',
  settings: 'Settings',
} as const;

export type NamedSegment = keyof typeof NAMED_DASHBOARD_SEGMENTS;

export type DashboardLocation =
  | { kind: 'today' }
  | { kind: 'named'; segment: NamedSegment; label: string }
  | { kind: 'deck'; deckId: string }
  | { kind: 'outside' };

export function dashboardLocation(pathname: string): DashboardLocation {
  if (pathname === '/dashboard' || pathname === '/dashboard/') return { kind: 'today' };
  const segment = pathname.match(/^\/dashboard\/([^/?#]+)/)?.[1];
  if (!segment) return { kind: 'outside' };
  if (Object.hasOwn(NAMED_DASHBOARD_SEGMENTS, segment)) {
    const named = segment as NamedSegment;
    return { kind: 'named', segment: named, label: NAMED_DASHBOARD_SEGMENTS[named] };
  }
  return { kind: 'deck', deckId: segment };
}

/** Settings swaps the sidebar's contents for its own sections (plan §6.4). */
export function sidebarMode(pathname: string): 'app' | 'settings' {
  const location = dashboardLocation(pathname);
  return location.kind === 'named' && location.segment === 'settings' ? 'settings' : 'app';
}

// ── Items ────────────────────────────────────────────────────────────

export type SidebarItemId = 'today' | 'drills' | 'stats' | 'shared' | 'explore' | 'trash';

export type SidebarCounts = {
  due: number;
  drillsDue: number;
  /** loadDueDrillsByDeck hit its row cap, so drillsDue is a floor. */
  drillsTruncated: boolean;
  shared: number;
  trashed: number;
};

export type SidebarItem = {
  id: SidebarItemId;
  label: string;
  href: string;
  group: 'study' | 'library';
  /** What the badge prints, or null for no badge. */
  count: string | null;
  /** The badge as words, for the accessible name ("47 due"). */
  countLabel: string | null;
  /** `due` only where the number is due work — the state channel (design system §2.2). */
  tone: 'due' | 'ink';
};

export function activeSidebarItem(pathname: string): SidebarItemId | null {
  const location = dashboardLocation(pathname);
  if (location.kind === 'today') return 'today';
  if (location.kind !== 'named') return null;
  switch (location.segment) {
    case 'stats':
      return 'stats';
    case 'drills':
      return 'drills';
    case 'shared':
      return 'shared';
    case 'trash':
      return 'trash';
    default:
      return null;
  }
}

export function activeDeckId(pathname: string): string | null {
  const location = dashboardLocation(pathname);
  return location.kind === 'deck' ? location.deckId : null;
}

/** 0 prints nothing: an empty badge is noise, and "0 due" is what the page says. */
export function formatCount(value: number, truncated = false): string | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  if (value > 999) return '999+';
  return truncated ? `${value}+` : String(value);
}

function badge(value: number | undefined, noun: (count: string) => string, truncated = false) {
  if (value === undefined) return { count: null, countLabel: null };
  const count = formatCount(value, truncated);
  return { count, countLabel: count ? noun(count) : null };
}

/**
 * The destinations, in render order. `counts` is null while the sidebar's
 * reads are still streaming: the items render at once, their badges after.
 */
export function buildSidebarItems(input: { counts: SidebarCounts | null; exploreEnabled: boolean }): SidebarItem[] {
  const { counts, exploreEnabled } = input;

  const items: SidebarItem[] = [
    {
      id: 'today',
      label: 'Today',
      href: '/dashboard',
      group: 'study',
      tone: 'due',
      ...badge(counts?.due, (n) => `${n} due`),
    },
    {
      id: 'drills',
      label: 'Drills',
      href: '/dashboard/drills',
      group: 'study',
      tone: 'due',
      ...badge(counts?.drillsDue, (n) => `${n} drills due`, counts?.drillsTruncated ?? false),
    },
    { id: 'stats', label: 'Statistics', href: '/dashboard/stats', group: 'study', tone: 'ink', count: null, countLabel: null },
    {
      id: 'shared',
      label: 'Shared',
      href: '/dashboard/shared',
      group: 'library',
      tone: 'ink',
      ...badge(counts?.shared, (n) => `${n} shared`),
    },
  ];

  if (exploreEnabled) {
    items.push({ id: 'explore', label: 'Explore', href: '/explore', group: 'library', tone: 'ink', count: null, countLabel: null });
  }

  items.push({
    id: 'trash',
    label: 'Trash',
    href: '/dashboard/trash',
    group: 'library',
    tone: 'ink',
    ...badge(counts?.trashed, (n) => `${n} in trash`),
  });

  return items;
}

// ── Library decks ────────────────────────────────────────────────────

export type SidebarDeck = { id: string; title: string; dueCount: number };

/** Past this the list ends in "All N decks", which goes to Today's index. */
export const SIDEBAR_DECK_LIMIT = 12;

/**
 * Decks with work first, most due first; ties keep the caller's order, which
 * is most recently updated (loadShellNav). A sidebar that reorders on every
 * visit is hard to find things in, so only due work moves a deck up.
 */
export function sidebarDecks(decks: SidebarDeck[], limit = SIDEBAR_DECK_LIMIT): { shown: SidebarDeck[]; hiddenCount: number } {
  const ordered = decks
    .map((deck, index) => ({ deck, index }))
    .sort((a, b) => b.deck.dueCount - a.deck.dueCount || a.index - b.index)
    .map(({ deck }) => deck);
  const cap = Math.max(0, Math.floor(limit));
  return { shown: ordered.slice(0, cap), hiddenCount: Math.max(0, ordered.length - cap) };
}

// ── Settings sections (sidebar in settings mode, plan §6.4) ───────────────

export type SettingsSectionId =
  | 'profile'
  | 'security'
  | 'appearance'
  | 'study'
  | 'sound'
  | 'shortcuts'
  | 'ai'
  | 'sharing'
  | 'data'
  | 'delete';

export const SETTINGS_SECTIONS: ReadonlyArray<{ id: SettingsSectionId; label: string; group: 'Account' | 'Preferences' | 'AI' | 'Data' }> = [
  { id: 'profile', label: 'Profile', group: 'Account' },
  { id: 'security', label: 'Sign-in & security', group: 'Account' },
  { id: 'appearance', label: 'Appearance', group: 'Preferences' },
  { id: 'study', label: 'Study', group: 'Preferences' },
  { id: 'sound', label: 'Sound & haptics', group: 'Preferences' },
  { id: 'shortcuts', label: 'Keyboard shortcuts', group: 'Preferences' },
  { id: 'ai', label: 'Usage & privacy', group: 'AI' },
  { id: 'sharing', label: 'Sharing', group: 'Data' },
  { id: 'data', label: 'Export & trash', group: 'Data' },
  { id: 'delete', label: 'Delete account', group: 'Data' },
];

// ── Collapse preference (plan §6.2) ───────────────────────────────────────

export const SIDEBAR_COOKIE = 'cognit-sidebar';

/**
 * `auto` (no cookie) lets CSS decide by width: collapsed from 768 to 1023 px,
 * expanded from 1024. A choice the user makes is stored in a cookie so the
 * server renders it — no reflow after hydration, which is why design system §8 used to
 * forbid persisting the rail at all.
 */
export type SidebarPreference = 'auto' | 'expanded' | 'collapsed';

export function parseSidebarPreference(value: string | undefined): SidebarPreference {
  return value === 'expanded' || value === 'collapsed' ? value : 'auto';
}
