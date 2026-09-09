/**
 * The dashboard is a server component, and its dialogs are client islands in
 * different parts of the tree — the create-deck dialog and the command palette
 * are both mounted by the shell layout, while the buttons that open them sit in
 * the rail, the due-now band and the onboarding panel.
 *
 * Named CustomEvents keep them decoupled and leave the layout alone. They are
 * also what lets one dialog have several triggers without several dialogs:
 * "focus returns to the trigger" stays true because the dialog reads
 * `document.activeElement` when it opens, whichever button that was.
 */
export const OPEN_CREATE_DECK_EVENT = 'cognit:open-create-deck';
export const OPEN_COMMAND_PALETTE_EVENT = 'cognit:open-command-palette';

function dispatch(name: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(name));
}

export function requestOpenCreateDeck() {
  dispatch(OPEN_CREATE_DECK_EVENT);
}

export function requestOpenCommandPalette() {
  dispatch(OPEN_COMMAND_PALETTE_EVENT);
}
