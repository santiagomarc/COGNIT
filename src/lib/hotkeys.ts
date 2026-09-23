/**
 * Page-level keyboard shortcuts and the dialogs that sit above them.
 *
 * Every shortcut in this app is a `window` keydown listener, and so is every
 * dialog's Escape/Tab handler — nothing stops propagation, so both run for
 * the same key. Without a guard, `S` pressed while "Leave this drill?" is
 * open skips the drill *behind* the dialog and deletes the answer the dialog
 * just promised to keep.
 *
 * A page shortcut stands down while any modal dialog is open. An overlay the
 * page drives itself — the quiz's pause overlay, whose `P` resumes — opts out
 * with `data-page-shortcuts="allow"`; its page is then responsible for
 * disabling whatever must not fire underneath it (the quiz already does).
 */
const BLOCKING_DIALOG = '[aria-modal="true"]:not([data-page-shortcuts="allow"])';

/** A field the user is typing into; page shortcuts must not steal its keys. */
export function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || (target instanceof HTMLElement && target.isContentEditable)
  );
}

/** A modal dialog is open over the page, so the page is out of use. */
export function isBlockingDialogOpen(root: ParentNode = document): boolean {
  return root.querySelector(BLOCKING_DIALOG) !== null;
}

/**
 * Whether a page-level shortcut must ignore this event: a blocking dialog is
 * open, or an IME composition is in progress (the key belongs to the
 * composer). Call it first in every window-level keydown handler.
 */
export function pageShortcutBlocked(event: Pick<KeyboardEvent, 'isComposing'>, root: ParentNode = document): boolean {
  return event.isComposing || isBlockingDialogOpen(root);
}

/**
 * Enter or Space moves past a feedback screen (the quiz's identification
 * result). Enter on a button in the quiz's quit dialog bubbles to `window`
 * too, and without the dialog guard it resolved the question behind the
 * dialog — KBD-01's MCQ bug in another mode.
 */
export function isAdvanceKey(
  event: Pick<KeyboardEvent, 'key' | 'repeat' | 'isComposing' | 'target'>,
  root: ParentNode = document,
): boolean {
  if (pageShortcutBlocked(event, root) || isTypingTarget(event.target)) return false;
  return (event.key === 'Enter' || event.key === ' ') && !event.repeat;
}
