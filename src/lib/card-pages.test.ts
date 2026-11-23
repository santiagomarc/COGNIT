import { describe, expect, it } from 'vitest';

import { appendCards, clampPage, dropCards, pageCount, pageItems, refreshFirstCards } from './card-pages';

const cards = (...ids: string[]) => ids.map((id) => ({ id }));
const ids = (list: { cards: Array<{ id: string }> }) => list.cards.map((card) => card.id).join('');

describe('pageCount and clampPage', () => {
  it('counts a part-filled last page, and one page for an empty list', () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(12)).toBe(1);
    expect(pageCount(13)).toBe(2);
  });

  it('falls back to the last page when the asked-for one is gone', () => {
    expect(clampPage(3, 2)).toBe(2);
    expect(clampPage(0, 2)).toBe(1);
  });
});

describe('pageItems', () => {
  it('lists every page up to seven', () => {
    expect(pageItems(1, 1)).toEqual([1]);
    expect(pageItems(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('always has seven slots above that, including the ends and the current page', () => {
    for (let pages = 8; pages <= 30; pages += 1) {
      for (let page = 1; page <= pages; page += 1) {
        const items = pageItems(page, pages);
        expect(items).toHaveLength(7);
        expect(items).toContain(page);
        expect(items[0]).toBe(1);
        expect(items[6]).toBe(pages);
      }
    }
  });
});

describe('appendCards', () => {
  it('skips cards it already has', () => {
    const next = appendCards({ cards: cards('a', 'b'), total: 4 }, cards('b', 'c'), 4);
    expect(ids(next)).toBe('abc');
    expect(next.total).toBe(4);
  });

  it('ends the list when a chunk brings nothing new', () => {
    expect(appendCards({ cards: cards('a', 'b'), total: 4 }, cards('b'), 4).total).toBe(2);
    expect(appendCards({ cards: cards('a'), total: 4 }, [], 4).total).toBe(1);
  });
});

describe('refreshFirstCards', () => {
  it('keeps the later cards when they still join up', () => {
    expect(ids(refreshFirstCards({ cards: cards('a', 'b', 'c', 'd'), total: 4 }, cards('a', 'b'), 4))).toBe('abcd');
  });

  it('keeps them after a card is added or removed at the front', () => {
    expect(ids(refreshFirstCards({ cards: cards('a', 'b', 'c', 'd'), total: 4 }, cards('n', 'a'), 5))).toBe('nabcd');
    expect(ids(refreshFirstCards({ cards: cards('a', 'b', 'c', 'd'), total: 4 }, cards('b', 'c'), 3))).toBe('bcd');
  });

  it('drops them when there would be a hole between', () => {
    expect(ids(refreshFirstCards({ cards: cards('a', 'b', 'c'), total: 3 }, cards('x', 'y'), 5))).toBe('xy');
    expect(ids(refreshFirstCards({ cards: cards('a'), total: 1 }, [], 0))).toBe('');
  });

  it('never holds more cards than the deck has', () => {
    expect(ids(refreshFirstCards({ cards: cards('a', 'b', 'c'), total: 3 }, cards('a', 'b'), 2))).toBe('ab');
  });
});

describe('dropCards', () => {
  it('lowers the total only by the cards it held', () => {
    const next = dropCards({ cards: cards('a', 'b', 'c'), total: 10 }, new Set(['b', 'zz']));
    expect(ids(next)).toBe('ac');
    expect(next.total).toBe(9);
  });
});
