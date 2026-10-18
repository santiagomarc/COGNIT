import { describe, expect, it } from 'vitest';
import { FULL_CONTEXT_MAX_CARDS, FULL_CONTEXT_MAX_CHARS, fitsWholeDeck, rankReferences } from './chat-context';

const card = (id: string, front: string, back: string) => ({ id, front, back });

describe('fitsWholeDeck', () => {
  it('takes a small deck whole', () => {
    expect(fitsWholeDeck([card('a', 'Mitosis', 'Cell division.')])).toBe(true);
  });

  it('refuses an empty deck, one card too many, and text over the budget', () => {
    expect(fitsWholeDeck([])).toBe(false);
    expect(fitsWholeDeck(Array.from({ length: FULL_CONTEXT_MAX_CARDS + 1 }, (_, i) => card(`${i}`, 'T', 'D')))).toBe(false);
    expect(fitsWholeDeck([card('a', 'T', 'x'.repeat(FULL_CONTEXT_MAX_CHARS))])).toBe(false);
  });
});

describe('rankReferences', () => {
  const deck = [
    card('a', 'Mitosis', 'Division producing two identical daughter cells.'),
    card('b', 'Meiosis', 'Division producing four haploid gametes.'),
    card('c', 'Osmosis', 'Water crossing a membrane.'),
  ];

  it('ranks by shared words, a match in the term counting double', () => {
    expect(rankReferences(deck, 'How does meiosis differ from mitosis division?').map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('ignores stopwords and leaves out cards sharing nothing', () => {
    expect(rankReferences(deck, 'what is the difference')).toEqual([]);
    expect(rankReferences(deck, 'membrane water').map((c) => c.id)).toEqual(['c']);
  });

  it('caps the chips', () => {
    expect(rankReferences(deck, 'division mitosis meiosis osmosis', 2)).toHaveLength(2);
  });
});
