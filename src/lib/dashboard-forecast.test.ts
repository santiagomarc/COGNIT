import { describe, expect, it } from 'vitest';

import {
  buildSevenDayForecast,
  estimateSessionMinutes,
  meanEaseByDeck,
  oldestOverdueDays,
  type CardScheduleRow,
} from './dashboard-forecast';

const NOW = new Date('2026-09-09T12:00:00.000Z');

function card(next: string | null, deck = 'd1', ease: number | null = 2.5): CardScheduleRow {
  return { deck_id: deck, ease_factor: ease, next_review_at: next };
}

describe('buildSevenDayForecast', () => {
  it('returns seven consecutive days starting today', () => {
    const days = buildSevenDayForecast([], NOW);
    expect(days).toHaveLength(7);
    expect(days.map((d) => d.date)).toEqual([
      '2026-09-09',
      '2026-09-10',
      '2026-09-11',
      '2026-09-12',
      '2026-09-13',
      '2026-09-14',
      '2026-09-15',
    ]);
    expect(days[0].isToday).toBe(true);
    expect(days.slice(1).every((d) => !d.isToday)).toBe(true);
  });

  it('buckets each card into the day it falls due', () => {
    const days = buildSevenDayForecast(
      [
        card('2026-09-09T23:00:00Z'),
        card('2026-09-10T01:00:00Z'),
        card('2026-09-10T22:00:00Z'),
        card('2026-09-15T09:00:00Z'),
      ],
      NOW
    );
    expect(days.map((d) => d.count)).toEqual([1, 2, 0, 0, 0, 0, 1]);
  });

  it('folds everything overdue into today rather than dropping it', () => {
    const days = buildSevenDayForecast(
      [card('2026-08-01T00:00:00Z'), card('2026-09-08T23:59:00Z'), card('2026-09-09T06:00:00Z')],
      NOW
    );
    expect(days[0].count).toBe(3);
  });

  it('ignores cards scheduled beyond the window', () => {
    const days = buildSevenDayForecast([card('2026-09-16T00:00:00Z')], NOW);
    expect(days.reduce((sum, d) => sum + d.count, 0)).toBe(0);
  });

  it('skips null and unparseable dates instead of throwing', () => {
    const days = buildSevenDayForecast([card(null), card('not-a-date')], NOW);
    expect(days.reduce((sum, d) => sum + d.count, 0)).toBe(0);
  });
});

describe('meanEaseByDeck', () => {
  it('averages ease per deck', () => {
    const means = meanEaseByDeck([
      card('2026-09-09T00:00:00Z', 'a', 2.0),
      card('2026-09-09T00:00:00Z', 'a', 3.0),
      card('2026-09-09T00:00:00Z', 'b', 1.3),
    ]);
    expect(means.get('a')).toBeCloseTo(2.5);
    expect(means.get('b')).toBeCloseTo(1.3);
  });

  it('skips cards with no ease rather than counting them as zero', () => {
    const means = meanEaseByDeck([
      card('2026-09-09T00:00:00Z', 'a', 2.6),
      card('2026-09-09T00:00:00Z', 'a', null),
    ]);
    expect(means.get('a')).toBeCloseTo(2.6);
  });

  it('omits a deck with no usable ease at all', () => {
    const means = meanEaseByDeck([card('2026-09-09T00:00:00Z', 'a', null)]);
    expect(means.has('a')).toBe(false);
  });
});

describe('oldestOverdueDays', () => {
  it('reports the age of the oldest overdue card in whole days', () => {
    expect(oldestOverdueDays([card('2026-09-05T12:00:00Z'), card('2026-09-08T12:00:00Z')], NOW)).toBe(4);
  });

  it('returns null when nothing is overdue', () => {
    expect(oldestOverdueDays([card('2026-09-10T00:00:00Z')], NOW)).toBeNull();
  });

  it('counts a card due exactly now as overdue by zero days', () => {
    expect(oldestOverdueDays([card('2026-09-09T12:00:00Z')], NOW)).toBe(0);
  });
});

describe('estimateSessionMinutes', () => {
  it('is zero for an empty queue', () => {
    expect(estimateSessionMinutes(0)).toBe(0);
  });

  it('never rounds a non-empty queue down to zero minutes', () => {
    expect(estimateSessionMinutes(1)).toBe(1);
  });

  it('uses the study client’s eight-second floor', () => {
    expect(estimateSessionMinutes(90)).toBe(12);
  });
});
