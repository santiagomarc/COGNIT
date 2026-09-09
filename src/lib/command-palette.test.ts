import { describe, expect, it } from 'vitest';

import {
  buildPaletteCommands,
  filterPaletteCommands,
  groupPaletteCommands,
  type PaletteDeck,
} from './command-palette';

const DECKS: PaletteDeck[] = [
  { id: 'a', title: 'Neuroanatomy', dueCount: 31 },
  { id: 'b', title: 'Spanish Verbs', dueCount: 0 },
];

function build(overrides: Partial<Parameters<typeof buildPaletteCommands>[0]> = {}) {
  return buildPaletteCommands({
    decks: DECKS,
    sessionHref: '/dashboard/a/study',
    totalDue: 31,
    themeCommandLabel: 'Switch to light mode',
    ...overrides,
  });
}

describe('buildPaletteCommands', () => {
  it('offers every action the spec requires', () => {
    const ids = build().map((command) => command.id);
    expect(ids).toEqual([
      'start-session',
      'decks',
      'new-deck',
      'toggle-theme',
      'sign-out',
      'deck:a',
      'deck:b',
    ]);
  });

  it('omits start-session when there is nowhere to start one', () => {
    const ids = build({ decks: [], sessionHref: null, totalDue: 0 }).map((c) => c.id);
    expect(ids).not.toContain('start-session');
    expect(ids).toContain('new-deck');
  });

  it('labels the session by whether there is work, and annotates the count', () => {
    const withWork = build().find((c) => c.id === 'start-session');
    expect(withWork?.label).toBe('Start session');
    expect(withWork?.hint).toBe('31 due');

    const ahead = build({ totalDue: 0 }).find((c) => c.id === 'start-session');
    expect(ahead?.label).toBe('Study ahead');
    expect(ahead?.hint).toBeUndefined();
  });

  it('routes deck rows to the deck, not to a session', () => {
    const deck = build().find((c) => c.id === 'deck:a');
    expect(deck?.href).toBe('/dashboard/a');
    expect(deck?.hint).toBe('31 due');
  });

  it('leaves a deck with nothing due unannotated', () => {
    expect(build().find((c) => c.id === 'deck:b')?.hint).toBeUndefined();
  });

  it('renders the theme label the caller supplies', () => {
    const command = build({ themeCommandLabel: 'Switch to dark mode' }).find(
      (c) => c.id === 'toggle-theme'
    );
    expect(command?.label).toBe('Switch to dark mode');
  });

  it('gives non-navigation commands an effect and no href', () => {
    const effects = build()
      .filter((c) => c.effect)
      .map((c) => [c.id, c.effect, c.href]);
    expect(effects).toEqual([
      ['new-deck', 'new-deck', undefined],
      ['toggle-theme', 'toggle-theme', undefined],
      ['sign-out', 'sign-out', undefined],
    ]);
  });
});

describe('filterPaletteCommands', () => {
  it('returns everything for an empty or whitespace query', () => {
    const commands = build();
    expect(filterPaletteCommands(commands, '')).toHaveLength(commands.length);
    expect(filterPaletteCommands(commands, '   ')).toHaveLength(commands.length);
  });

  it('matches keywords that are never rendered', () => {
    const ids = filterPaletteCommands(build(), 'logout').map((c) => c.id);
    expect(ids).toEqual(['sign-out']);
  });

  it('matches deck titles case-insensitively', () => {
    const ids = filterPaletteCommands(build(), 'NEURO').map((c) => c.id);
    expect(ids).toEqual(['deck:a']);
  });

  it('requires every token to match', () => {
    expect(filterPaletteCommands(build(), 'spanish verbs').map((c) => c.id)).toEqual(['deck:b']);
    expect(filterPaletteCommands(build(), 'spanish neuro')).toEqual([]);
  });

  it('never reorders the rows it keeps', () => {
    const ids = filterPaletteCommands(build(), 'deck').map((c) => c.id);
    expect(ids).toEqual(['decks', 'new-deck', 'deck:a', 'deck:b']);
  });

  it('does not surface a destructive command for a single unrelated letter', () => {
    // "s" appears in "session" and "decks"; it must not put Sign out first.
    const ids = filterPaletteCommands(build(), 'sign').map((c) => c.id);
    expect(ids).toEqual(['sign-out']);
  });
});

describe('groupPaletteCommands', () => {
  it('collects consecutive rows under one heading', () => {
    const sections = groupPaletteCommands(build());
    expect(sections.map((s) => s.group)).toEqual(['Actions', 'Decks']);
    expect(sections[0].commands).toHaveLength(5);
    expect(sections[1].commands.map((c) => c.id)).toEqual(['deck:a', 'deck:b']);
  });

  it('drops a heading whose rows were all filtered out', () => {
    const sections = groupPaletteCommands(filterPaletteCommands(build(), 'neuro'));
    expect(sections.map((s) => s.group)).toEqual(['Decks']);
  });

  it('returns nothing for an empty command list', () => {
    expect(groupPaletteCommands([])).toEqual([]);
  });
});
