import { describe, expect, it } from 'vitest';
import { STARTER_DECKS, STARTER_DECK_KEYS } from './starter-decks';
import { isEnumerationLike, isValidTermFront } from './card-generation';
import { DECK_TAG_VALUES } from './deck-tags';
import { bulkImportSchema } from './schemas';

describe('starter decks', () => {
  it('offers three decks', () => {
    expect(STARTER_DECK_KEYS).toHaveLength(3);
  });

  it.each(STARTER_DECK_KEYS)('%s has at least 20 cards', (key) => {
    expect(STARTER_DECKS[key].cards.length).toBeGreaterThanOrEqual(20);
  });

  it.each(STARTER_DECK_KEYS)('%s uses a real deck tag', (key) => {
    expect(DECK_TAG_VALUES).toContain(STARTER_DECKS[key].tag);
  });

  // The whole point of the starter decks is a good first impression. A card
  // that would fail the app's own generation rules undercuts that.
  it.each(STARTER_DECK_KEYS)('%s fronts all pass isValidTermFront', (key) => {
    const bad = STARTER_DECKS[key].cards
      .filter((card) => !isValidTermFront(card.front))
      .map((card) => card.front);
    expect(bad).toEqual([]);
  });

  it.each(STARTER_DECK_KEYS)('%s backs are never enumerations', (key) => {
    const bad = STARTER_DECKS[key].cards
      .filter((card) => isEnumerationLike(card.back))
      .map((card) => card.front);
    expect(bad).toEqual([]);
  });

  it.each(STARTER_DECK_KEYS)('%s backs are substantial but not essays', (key) => {
    for (const card of STARTER_DECKS[key].cards) {
      expect(card.back.length).toBeGreaterThanOrEqual(40);
      expect(card.back.length).toBeLessThanOrEqual(400);
    }
  });

  it.each(STARTER_DECK_KEYS)('%s has no duplicate fronts', (key) => {
    const fronts = STARTER_DECKS[key].cards.map((card) => card.front.toLowerCase());
    expect(new Set(fronts).size).toBe(fronts.length);
  });

  // Onboarding imports these through bulkImportCards, so they must satisfy the
  // same schema a user's own paste does.
  it.each(STARTER_DECK_KEYS)('%s is accepted by bulkImportSchema', (key) => {
    const parsed = bulkImportSchema.safeParse({
      deck_id: '00000000-0000-4000-8000-000000000001',
      cards: STARTER_DECKS[key].cards.map((card) => ({ front: card.front, back: card.back })),
      imported_by: 'Cognit starter deck',
    });
    expect(parsed.success).toBe(true);
  });
});
