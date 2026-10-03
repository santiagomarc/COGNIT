import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { SHORTCUTS, SHORTCUT_SCOPES, groupShortcuts, isShortcutsHotkey, keycapLabel } from './shortcuts';

const COMPONENTS = path.resolve(__dirname, '../components/ui/shared');

function sourceOf(owner: string): string | null {
  for (const candidate of [`${owner}.tsx`, `synthesis/${owner}.tsx`]) {
    try {
      return readFileSync(path.join(COMPONENTS, candidate), 'utf8');
    } catch {
      // try the next folder
    }
  }
  return null;
}

describe('SHORTCUTS', () => {
  it('has unique ids and a known scope for every row', () => {
    const ids = SHORTCUTS.map((shortcut) => shortcut.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(SHORTCUTS.every((shortcut) => SHORTCUT_SCOPES.includes(shortcut.scope))).toBe(true);
  });

  it('names an owner that exists and still listens for keys', () => {
    for (const shortcut of SHORTCUTS) {
      const source = sourceOf(shortcut.owner);
      expect(source, `${shortcut.owner}.tsx`).not.toBeNull();
      expect(source, `${shortcut.owner} binds ${shortcut.id}`).toMatch(/keydown|onKeyDown/);
    }
  });

  it('groups in scope order', () => {
    expect(groupShortcuts().map((group) => group.scope)).toEqual(SHORTCUT_SCOPES);
  });
});

describe('keycaps and the ? hotkey', () => {
  it('renders Mod per platform', () => {
    expect(keycapLabel('Mod', true)).toBe('⌘');
    expect(keycapLabel('Mod', false)).toBe('Ctrl');
    expect(keycapLabel('S', true)).toBe('S');
  });

  it('opens on ? (typed with Shift) and on nothing else', () => {
    const base = { metaKey: false, ctrlKey: false, altKey: false };
    expect(isShortcutsHotkey({ ...base, key: '?' })).toBe(true);
    expect(isShortcutsHotkey({ ...base, key: '?', metaKey: true })).toBe(false);
    expect(isShortcutsHotkey({ ...base, key: '/' })).toBe(false);
  });
});
