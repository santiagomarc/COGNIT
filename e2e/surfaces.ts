import type { Fixture } from './state';

/*
 * The pages axe checks: the two public pages people land on, and the four
 * signed-in ones the study loop runs through (UIUX plan §4.3, trimmed).
 *
 * The list is static: Playwright collects tests before global setup seeds the
 * deck, so a test's name can't depend on the seed. `:deck` is filled in when
 * the test runs.
 */
export type Surface = { name: string; path: string; signedIn: boolean };

export const SURFACES: Surface[] = [
  { name: 'landing', path: '/', signedIn: false },
  { name: 'login', path: '/login', signedIn: false },
  { name: 'today', path: '/dashboard', signedIn: true },
  { name: 'deck', path: '/dashboard/:deck?tab=overview', signedIn: true },
  { name: 'study', path: '/dashboard/:deck/study?count=5&scope=include_reviewed', signedIn: true },
  { name: 'quiz', path: '/dashboard/:deck/quiz?count=5&mode=mcq', signedIn: true },
];

/** The surface's URL for this run, or why it can't be visited. */
export function resolveSurface(surface: Surface, fixture: Fixture): { path: string } | { skip: string } {
  if (!surface.signedIn) return { path: surface.path };
  if (!fixture.signedIn) return { skip: fixture.reason };
  return { path: surface.path.replace(':deck', fixture.deckId) };
}
