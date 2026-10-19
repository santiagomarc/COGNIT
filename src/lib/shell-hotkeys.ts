import { isTypingTarget, pageShortcutBlocked } from '@/lib/hotkeys';
import { isShortcutsHotkey } from '@/lib/shortcuts';

/*
 * The shell dialogs' opening keys, in one place (performance plan PERF-13).
 * The dialogs load on first use, so a few-line listener has to recognise the
 * same keys the dialogs do; sharing these keeps the two from drifting.
 */

/** ⌘N / Ctrl+N, unless a dialog is open or the user is typing. */
export function opensCreateDeck(event: KeyboardEvent): boolean {
  if (pageShortcutBlocked(event) || isTypingTarget(event.target)) return false;
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return false;
  return event.key.toLowerCase() === 'n';
}

/** `?`, unless a dialog is open or the user is typing. */
export function opensShortcuts(event: KeyboardEvent): boolean {
  if (pageShortcutBlocked(event) || isTypingTarget(event.target)) return false;
  return isShortcutsHotkey(event);
}

/** ⌘K / Ctrl+K. Whether it opens or closes the palette is the palette's call (paletteOpenAfterHotkey). */
export function isPaletteHotkey(event: KeyboardEvent): boolean {
  return (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
}
