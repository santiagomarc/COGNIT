import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isPaletteHotkey, opensCreateDeck, opensShortcuts } from '@/lib/shell-hotkeys';

// The suite runs in node: stand in for `document` and the element classes
// isTypingTarget checks, as hotkeys.test.ts does.
class FakeElement { isContentEditable = false; }
class FakeInput extends FakeElement {}

function stubPage({ dialogOpen = false } = {}) {
  vi.stubGlobal('document', { querySelector: () => (dialogOpen ? ({} as Element) : null) });
}

const keyEvent = (init: Partial<KeyboardEvent>): KeyboardEvent => ({
  key: '',
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  isComposing: false,
  target: new FakeElement(),
  ...init,
}) as unknown as KeyboardEvent;

describe('shell hotkeys', () => {
  beforeEach(() => {
    vi.stubGlobal('HTMLElement', FakeElement);
    vi.stubGlobal('HTMLInputElement', FakeInput);
    vi.stubGlobal('HTMLTextAreaElement', class extends FakeElement {});
    vi.stubGlobal('HTMLSelectElement', class extends FakeElement {});
    stubPage();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens create-deck on ⌘N or Ctrl+N, and not with another modifier', () => {
    expect(opensCreateDeck(keyEvent({ key: 'n', metaKey: true }))).toBe(true);
    expect(opensCreateDeck(keyEvent({ key: 'N', ctrlKey: true }))).toBe(true);
    expect(opensCreateDeck(keyEvent({ key: 'n', metaKey: true, shiftKey: true }))).toBe(false);
    expect(opensCreateDeck(keyEvent({ key: 'n' }))).toBe(false);
  });

  it('opens shortcuts on ?, not ⌘?', () => {
    expect(opensShortcuts(keyEvent({ key: '?' }))).toBe(true);
    expect(opensShortcuts(keyEvent({ key: '?', metaKey: true }))).toBe(false);
  });

  it('leaves keys typed into a field alone', () => {
    const target = new FakeInput() as unknown as EventTarget;
    expect(opensCreateDeck(keyEvent({ key: 'n', metaKey: true, target }))).toBe(false);
    expect(opensShortcuts(keyEvent({ key: '?', target }))).toBe(false);
  });

  it('stands down while a dialog is open', () => {
    stubPage({ dialogOpen: true });
    expect(opensCreateDeck(keyEvent({ key: 'n', metaKey: true }))).toBe(false);
    expect(opensShortcuts(keyEvent({ key: '?' }))).toBe(false);
  });

  it('recognises ⌘K and Ctrl+K', () => {
    expect(isPaletteHotkey(keyEvent({ key: 'k', metaKey: true }))).toBe(true);
    expect(isPaletteHotkey(keyEvent({ key: 'K', ctrlKey: true }))).toBe(true);
    expect(isPaletteHotkey(keyEvent({ key: 'k' }))).toBe(false);
  });
});
