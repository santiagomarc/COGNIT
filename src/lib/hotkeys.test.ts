import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isAdvanceKey, isBlockingDialogOpen, pageShortcutBlocked } from '@/lib/hotkeys';

/** A stand-in for `document` that answers only the selector the guard uses. */
function rootWith(dialogs: { allow?: boolean }[]): ParentNode {
  return {
    querySelector: (selector: string) => {
      const blocking = dialogs.some((dialog) => !dialog.allow);
      return selector.includes('[aria-modal="true"]') && blocking ? ({} as Element) : null;
    },
  } as unknown as ParentNode;
}

describe('pageShortcutBlocked', () => {
  it('lets shortcuts through when no dialog is open', () => {
    expect(pageShortcutBlocked({ isComposing: false }, rootWith([]))).toBe(false);
  });

  it('stands down while a modal dialog is open (the drill quit dialog)', () => {
    expect(pageShortcutBlocked({ isComposing: false }, rootWith([{}]))).toBe(true);
  });

  it('does not stand down for an overlay the page drives itself (quiz pause)', () => {
    expect(isBlockingDialogOpen(rootWith([{ allow: true }]))).toBe(false);
  });

  it('still stands down when a real dialog opens above a page-driven overlay', () => {
    expect(isBlockingDialogOpen(rootWith([{ allow: true }, {}]))).toBe(true);
  });

  it('ignores keys that belong to an IME composition', () => {
    expect(pageShortcutBlocked({ isComposing: true }, rootWith([]))).toBe(true);
  });
});

describe('isAdvanceKey — the quiz identification result', () => {
  // The suite runs in node: give `isTypingTarget` the element classes it checks.
  class FakeElement { isContentEditable = false; }
  class FakeInput extends FakeElement {}
  beforeEach(() => {
    vi.stubGlobal('HTMLElement', FakeElement);
    vi.stubGlobal('HTMLInputElement', FakeInput);
    vi.stubGlobal('HTMLTextAreaElement', class extends FakeElement {});
    vi.stubGlobal('HTMLSelectElement', class extends FakeElement {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const key = (overrides: Partial<Pick<KeyboardEvent, 'key' | 'repeat' | 'isComposing' | 'target'>> = {}) => ({
    key: 'Enter',
    repeat: false,
    isComposing: false,
    target: new FakeElement() as unknown as EventTarget,
    ...overrides,
  });

  it('does not advance the question behind an open quit dialog when Enter lands on its button', () => {
    expect(isAdvanceKey(key(), rootWith([{}]))).toBe(false);
    expect(isAdvanceKey(key({ key: ' ' }), rootWith([{}]))).toBe(false);
  });

  it('advances on Enter or Space when no dialog is open', () => {
    expect(isAdvanceKey(key(), rootWith([]))).toBe(true);
    expect(isAdvanceKey(key({ key: ' ' }), rootWith([]))).toBe(true);
  });

  it('never takes a key typed into a field, a held key, or any other key', () => {
    expect(isAdvanceKey(key({ target: new FakeInput() as unknown as EventTarget }), rootWith([]))).toBe(false);
    expect(isAdvanceKey(key({ repeat: true }), rootWith([]))).toBe(false);
    expect(isAdvanceKey(key({ key: 'n' }), rootWith([]))).toBe(false);
  });
});
