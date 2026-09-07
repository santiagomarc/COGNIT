/**
 * The dashboard is a server component, and CreateDeckModal and
 * DashboardOnboarding are sibling client islands in different grid areas —
 * so they cannot share React state without hoisting the whole layout into one
 * client component.
 *
 * A named CustomEvent keeps them decoupled and leaves the layout alone.
 */
export const OPEN_CREATE_DECK_EVENT = 'cognit:open-create-deck';

export function requestOpenCreateDeck() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OPEN_CREATE_DECK_EVENT));
}
