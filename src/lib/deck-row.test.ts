import { describe, expect, it } from 'vitest';

import { deckState } from './deck-row';

const base = { cardCount: 10, dueCount: 0, dueDrillCount: 0, assessedCards: 0 };

describe('deckState', () => {
  it('an empty deck is empty, whatever else it reports', () => {
    expect(deckState({ ...base, cardCount: 0, dueCount: 3 })).toBe('empty');
  });

  it('work outranks progress: due cards or due drills make a deck due', () => {
    expect(deckState({ ...base, dueCount: 1, assessedCards: 10 })).toBe('due');
    expect(deckState({ ...base, dueDrillCount: 1, assessedCards: 10 })).toBe('due');
  });

  it('a deck never quizzed is neutral, not learning', () => {
    expect(deckState(base)).toBe('neutral');
  });

  it('quiz-proven cards never make a deck mastered', () => {
    expect(deckState({ ...base, assessedCards: 10 })).toBe('learning');
  });
});
