import { describe, expect, it } from 'vitest';

import {
  SETTINGS_SECTIONS,
  SIDEBAR_DECK_LIMIT,
  activeDeckId,
  activeSidebarItem,
  buildSidebarItems,
  dashboardLocation,
  formatCount,
  parseSidebarPreference,
  sidebarDecks,
  sidebarMode,
  type SidebarCounts,
} from './sidebar-nav';

const DECK = '00000000-0000-4000-8000-000000000001';
const COUNTS: SidebarCounts = { due: 47, drillsDue: 4, drillsTruncated: false, shared: 2, trashed: 1 };

describe('dashboardLocation', () => {
  it('names Today, the named routes and decks', () => {
    expect(dashboardLocation('/dashboard')).toEqual({ kind: 'today' });
    expect(dashboardLocation('/dashboard/stats')).toEqual({ kind: 'named', segment: 'stats', label: 'Statistics' });
    expect(dashboardLocation('/dashboard/settings')).toMatchObject({ segment: 'settings' });
    expect(dashboardLocation(`/dashboard/${DECK}`)).toEqual({ kind: 'deck', deckId: DECK });
    expect(dashboardLocation(`/dashboard/${DECK}/study`)).toEqual({ kind: 'deck', deckId: DECK });
    expect(dashboardLocation('/explore')).toEqual({ kind: 'outside' });
  });

  it('does not treat an Object.prototype key as a named route', () => {
    expect(dashboardLocation('/dashboard/constructor')).toEqual({ kind: 'deck', deckId: 'constructor' });
  });
});

describe('active item', () => {
  it('marks the destination, and no item on a deck or in settings', () => {
    expect(activeSidebarItem('/dashboard')).toBe('today');
    expect(activeSidebarItem('/dashboard/drills')).toBe('drills');
    expect(activeSidebarItem('/dashboard/trash')).toBe('trash');
    expect(activeSidebarItem(`/dashboard/${DECK}`)).toBeNull();
    expect(activeSidebarItem('/dashboard/settings')).toBeNull();
    expect(activeDeckId(`/dashboard/${DECK}`)).toBe(DECK);
    expect(activeDeckId('/dashboard/shared')).toBeNull();
  });

  it('switches to settings mode only under /dashboard/settings', () => {
    expect(sidebarMode('/dashboard/settings')).toBe('settings');
    expect(sidebarMode('/dashboard')).toBe('app');
    expect(sidebarMode(`/dashboard/${DECK}`)).toBe('app');
  });
});

describe('formatCount', () => {
  it('prints nothing for zero, caps at 999+ and marks a floor', () => {
    expect(formatCount(0)).toBeNull();
    expect(formatCount(-3)).toBeNull();
    expect(formatCount(Number.NaN)).toBeNull();
    expect(formatCount(47)).toBe('47');
    expect(formatCount(1200)).toBe('999+');
    expect(formatCount(200, true)).toBe('200+');
  });
});

describe('buildSidebarItems', () => {
  it('lists the destinations in order, Explore only behind its flag', () => {
    expect(buildSidebarItems({ counts: COUNTS, exploreEnabled: false }).map((item) => item.id)).toEqual([
      'today',
      'drills',
      'stats',
      'shared',
      'trash',
    ]);
    expect(buildSidebarItems({ counts: COUNTS, exploreEnabled: true }).map((item) => item.id)).toContain('explore');
  });

  it('badges with words for the accessible name, and only due work takes the due tone', () => {
    const items = buildSidebarItems({ counts: COUNTS, exploreEnabled: false });
    const today = items.find((item) => item.id === 'today');
    expect(today).toMatchObject({ count: '47', countLabel: '47 due', tone: 'due' });
    expect(items.find((item) => item.id === 'trash')).toMatchObject({ count: '1', countLabel: '1 in trash', tone: 'ink' });
    expect(items.find((item) => item.id === 'stats')?.count).toBeNull();
  });

  it('renders every item with no badges while counts are loading', () => {
    const items = buildSidebarItems({ counts: null, exploreEnabled: false });
    expect(items).toHaveLength(5);
    expect(items.every((item) => item.count === null && item.countLabel === null)).toBe(true);
  });

  it('marks a truncated drill count as a floor', () => {
    const drills = buildSidebarItems({ counts: { ...COUNTS, drillsDue: 200, drillsTruncated: true }, exploreEnabled: false })
      .find((item) => item.id === 'drills');
    expect(drills?.count).toBe('200+');
  });
});

describe('sidebarDecks', () => {
  const decks = [
    { id: 'a', title: 'Recent, nothing due', dueCount: 0 },
    { id: 'b', title: 'Some due', dueCount: 9 },
    { id: 'c', title: 'Most due', dueCount: 21 },
    { id: 'd', title: 'Older, nothing due', dueCount: 0 },
  ];

  it('puts due work first and otherwise keeps the recency order', () => {
    expect(sidebarDecks(decks).shown.map((deck) => deck.id)).toEqual(['c', 'b', 'a', 'd']);
  });

  it('caps the list and reports how many it hid', () => {
    const many = Array.from({ length: SIDEBAR_DECK_LIMIT + 3 }, (_, i) => ({ id: `${i}`, title: `${i}`, dueCount: 0 }));
    const { shown, hiddenCount } = sidebarDecks(many);
    expect(shown).toHaveLength(SIDEBAR_DECK_LIMIT);
    expect(hiddenCount).toBe(3);
    expect(sidebarDecks(decks, 2)).toMatchObject({ hiddenCount: 2 });
  });
});

describe('settings sections', () => {
  it('have unique ids, usable as fragment anchors', () => {
    const ids = SETTINGS_SECTIONS.map((section) => section.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^[a-z]+$/.test(id))).toBe(true);
  });
});

describe('parseSidebarPreference', () => {
  it('reads the cookie, defaulting to auto', () => {
    expect(parseSidebarPreference('collapsed')).toBe('collapsed');
    expect(parseSidebarPreference('expanded')).toBe('expanded');
    expect(parseSidebarPreference(undefined)).toBe('auto');
    expect(parseSidebarPreference('wide')).toBe('auto');
  });
});
