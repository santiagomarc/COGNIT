import { describe, expect, it } from 'vitest';
import {
  swipeIntent,
  summaryActions,
  DEFAULT_SESSION_CARD_COUNT,
  MAX_SESSION_CARD_COUNT,
  MIN_SESSION_CARD_COUNT,
  NEW_CARDS_PER_SESSION,
  getSessionCardBounds,
  interleaveNewCards,
  newCardAllowance,
  normalizeSessionCardCount,
  parseSessionCardIds,
} from './study';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';

describe('parseSessionCardIds', () => {
  it('keeps well-formed ids in order, drops junk and duplicates, and caps the list', () => {
    expect(parseSessionCardIds(undefined)).toEqual([]);
    expect(parseSessionCardIds('')).toEqual([]);
    expect(parseSessionCardIds(`${A}, ${B},not-an-id,${A}`)).toEqual([A, B]);
    expect(parseSessionCardIds([`${B}`, `${A}`])).toEqual([B]);   // first value only, like every other param
    const many = Array.from({ length: MAX_SESSION_CARD_COUNT + 5 }, (_, i) => `00000000-0000-4000-8000-${i.toString(16).padStart(12, '0')}`).join(',');
    expect(parseSessionCardIds(many)).toHaveLength(MAX_SESSION_CARD_COUNT);
  });
});

describe('interleaveNewCards', () => {
  it('places one new card after every N scheduled cards', () => {
    const out = interleaveNewCards(['r1', 'r2', 'r3', 'r4', 'r5', 'r6'], ['n1', 'n2'], { every: 3 });
    expect(out).toEqual(['r1', 'r2', 'r3', 'n1', 'r4', 'r5', 'r6', 'n2']);
  });

  it('fills the session with new cards when nothing is scheduled', () => {
    expect(interleaveNewCards([], ['n1', 'n2', 'n3'], { every: 3 })).toEqual(['n1', 'n2', 'n3']);
  });

  it('never drops a scheduled card when new cards run out', () => {
    const out = interleaveNewCards(['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7'], ['n1'], { every: 3 });
    expect(out).toEqual(['r1', 'r2', 'r3', 'n1', 'r4', 'r5', 'r6', 'r7']);
  });

  it('treats a non-positive stride as one', () => {
    expect(interleaveNewCards(['r1', 'r2'], ['n1', 'n2'], { every: 0 })).toEqual(['r1', 'n1', 'r2', 'n2']);
  });
});

describe('session size from the account default (sidebar plan §5.5)', () => {
  it('uses the preferred count when there is no ?count=', () => {
    expect(normalizeSessionCardCount(undefined, 200, 25)).toBe(25);
    expect(normalizeSessionCardCount(undefined, 200)).toBe(DEFAULT_SESSION_CARD_COUNT);
  });

  it('lets an explicit ?count= win over the preference', () => {
    expect(normalizeSessionCardCount('15', 200, 25)).toBe(15);
  });

  it('clamps the preference to the deck and to the global bounds', () => {
    expect(normalizeSessionCardCount(undefined, 12, 25)).toBe(12);
    expect(getSessionCardBounds(200, 500).defaultCount).toBe(MAX_SESSION_CARD_COUNT);
    expect(getSessionCardBounds(200, 1).defaultCount).toBe(MIN_SESSION_CARD_COUNT);
    expect(getSessionCardBounds(200, Number.NaN).defaultCount).toBe(DEFAULT_SESSION_CARD_COUNT);
  });
});

describe('newCardAllowance', () => {
  it('keeps the old formula at the old constant', () => {
    expect(newCardAllowance(10, 20)).toBe(NEW_CARDS_PER_SESSION);
    expect(newCardAllowance(10, 2)).toBe(8);
  });

  it('takes the account value, and zero means none while reviews fill the session', () => {
    expect(newCardAllowance(10, 20, 0)).toBe(0);
    expect(newCardAllowance(10, 4, 0)).toBe(6);
    expect(newCardAllowance(10, 20, 12)).toBe(12);
  });
});

describe('summaryActions (UIUX plan §5.5)', () => {
  const next = { deckId: 'deck-b', title: 'Pharmacology', dueCount: 12 };

  it('keeps going in this deck while cards are due, in a fresh URL', () => {
    const { primary, secondary } = summaryActions('deck-a', { hereDue: 21, next }, 10, 'r1');
    expect(primary.label).toBe('Keep going · next 10 (11 left here)');
    expect(primary.href).toBe('/dashboard/deck-a/study?scope=due&count=10&round=r1');
    expect(secondary).toEqual({ label: 'Back to deck', href: '/dashboard/deck-a' });
  });

  it('says "last" when the next chunk finishes the deck', () => {
    const { primary } = summaryActions('deck-a', { hereDue: 4, next: null }, 10, 'r1');
    expect(primary.label).toBe('Keep going · last 4');
  });

  it('moves to the deck with the most due when this one is done', () => {
    const { primary, secondary } = summaryActions('deck-a', { hereDue: 0, next }, 10, 'r1');
    expect(primary.label).toBe('Next: Pharmacology · 12 due');
    expect(primary.href).toBe('/dashboard/deck-b/study?scope=due&count=10&round=r1');
    expect(secondary.href).toBe('/dashboard');
  });

  it('goes back to Today, offering to study ahead, when nothing is due anywhere', () => {
    const { primary, secondary } = summaryActions('deck-a', { hereDue: 0, next: null }, 10, 'r1');
    expect(primary).toEqual({ label: 'Back to Today', href: '/dashboard' });
    expect(secondary.href).toBe('/dashboard/deck-a/study?scope=include_reviewed');
  });
});

describe('swipeIntent (UIUX plan §5.9)', () => {
  it('shows nothing near the centre', () => {
    expect(swipeIntent(30, 0)).toEqual({ grade: null, commits: false });
    expect(swipeIntent(-40, 0)).toEqual({ grade: null, commits: false });
  });

  it('previews Good to the right and Again to the left before it commits', () => {
    expect(swipeIntent(80, 0)).toEqual({ grade: 'good', commits: false });
    expect(swipeIntent(-80, 0)).toEqual({ grade: 'again', commits: false });
  });

  it('commits past 120 px', () => {
    expect(swipeIntent(121, 0)).toEqual({ grade: 'good', commits: true });
    expect(swipeIntent(-121, 0)).toEqual({ grade: 'again', commits: true });
    expect(swipeIntent(120, 0).commits).toBe(false);
  });

  it('commits a short fast flick in the direction it moves', () => {
    expect(swipeIntent(60, 900)).toEqual({ grade: 'good', commits: true });
    expect(swipeIntent(-60, -900)).toEqual({ grade: 'again', commits: true });
  });

  it('does not treat a fast flick under 40 px as a grade', () => {
    expect(swipeIntent(30, 900)).toEqual({ grade: null, commits: false });
  });
});
