import { describe, expect, it } from 'vitest';

import {
  buildSevenDayForecast,
  estimateSessionMinutes,
  forecastFromDayCounts,
  meanEaseByDeck,
  oldestOverdueDays,
  overdueDaysSince,
  parseCardScheduleSummary,
  type CardScheduleRow,
} from './dashboard-forecast';

const NOW = new Date('2026-09-09T12:00:00.000Z');

function card(next: string | null, deck = 'd1', ease: number | null = 2.5): CardScheduleRow {
  return { deck_id: deck, ease_factor: ease, next_review_at: next };
}

describe('buildSevenDayForecast', () => {
  it('returns seven consecutive days starting tomorrow', () => {
    const days = buildSevenDayForecast([], NOW);
    expect(days).toHaveLength(7);
    expect(days.map((d) => d.date)).toEqual([
      '2026-09-10',
      '2026-09-11',
      '2026-09-12',
      '2026-09-13',
      '2026-09-14',
      '2026-09-15',
      '2026-09-16',
    ]);
  });

  it('never includes today', () => {
    const days = buildSevenDayForecast([], NOW);
    expect(days.map((d) => d.date)).not.toContain('2026-09-09');
  });

  it('buckets each card into the day it falls due', () => {
    const days = buildSevenDayForecast(
      [
        card('2026-09-10T01:00:00Z'),
        card('2026-09-10T22:00:00Z'),
        card('2026-09-11T09:00:00Z'),
        card('2026-09-16T09:00:00Z'),
      ],
      NOW
    );
    expect(days.map((d) => d.count)).toEqual([2, 1, 0, 0, 0, 0, 1]);
  });

  /*
   * The change this test guards: at 519 due, folding overdue into column 0 made
   * that column ~4.6x the tallest projected day and flattened the rest. Today's
   * work is the due-now band's hero figure; the forecast answers a different
   * question and must not restate it.
   */
  it('excludes overdue and due-today cards from the window entirely', () => {
    const days = buildSevenDayForecast(
      [card('2026-08-01T00:00:00Z'), card('2026-09-08T23:59:00Z'), card('2026-09-09T06:00:00Z')],
      NOW
    );
    expect(days.reduce((sum, d) => sum + d.count, 0)).toBe(0);
  });

  it('ignores cards scheduled beyond the window', () => {
    const days = buildSevenDayForecast([card('2026-09-17T00:00:00Z')], NOW);
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

/*
 * The aggregated (RPC) path must hand the chart the identical shape the
 * row-based path does, or the two would drift the first time one is edited.
 */
describe('forecastFromDayCounts', () => {
  it('expands sparse day counts into the full seven-column window', () => {
    const days = forecastFromDayCounts(
      [
        { date: '2026-09-10', count: 2 },
        { date: '2026-09-11', count: 1 },
        { date: '2026-09-16', count: 1 },
      ],
      NOW
    );
    expect(days.map((d) => d.count)).toEqual([2, 1, 0, 0, 0, 0, 1]);
  });

  it('produces the same window as the row-based forecast', () => {
    expect(forecastFromDayCounts([], NOW).map((d) => d.date)).toEqual(
      buildSevenDayForecast([], NOW).map((d) => d.date)
    );
  });

  it('ignores dates outside the window rather than growing it', () => {
    const days = forecastFromDayCounts(
      [
        { date: '2026-09-09', count: 5 },
        { date: '2026-09-17', count: 5 },
      ],
      NOW
    );
    expect(days).toHaveLength(7);
    expect(days.reduce((sum, d) => sum + d.count, 0)).toBe(0);
  });
});

describe('overdueDaysSince', () => {
  it('agrees with oldestOverdueDays for the same timestamp', () => {
    expect(overdueDaysSince('2026-09-05T12:00:00Z', NOW)).toBe(
      oldestOverdueDays([card('2026-09-05T12:00:00Z')], NOW)
    );
  });

  it('returns null for nothing overdue, a future date, or garbage', () => {
    expect(overdueDaysSince(null, NOW)).toBeNull();
    expect(overdueDaysSince('2026-09-10T00:00:00Z', NOW)).toBeNull();
    expect(overdueDaysSince('not-a-date', NOW)).toBeNull();
  });
});

describe('parseCardScheduleSummary', () => {
  const valid = {
    forecast: [{ date: '2026-09-10', count: 2 }],
    ease_by_deck: [{ deck_id: 'd1', mean_ease: 2.5 }],
    oldest_overdue_at: '2026-09-05T12:00:00Z',
  };

  it('accepts a well-formed payload, including a null oldest-overdue', () => {
    expect(parseCardScheduleSummary(valid)).toEqual(valid);
    expect(parseCardScheduleSummary({ ...valid, oldest_overdue_at: null })?.oldest_overdue_at).toBeNull();
  });

  it('rejects rather than half-reads a malformed payload', () => {
    expect(parseCardScheduleSummary(null)).toBeNull();
    expect(parseCardScheduleSummary('nope')).toBeNull();
    expect(parseCardScheduleSummary({ ...valid, forecast: 'nope' })).toBeNull();
    expect(parseCardScheduleSummary({ ...valid, forecast: [{ date: 1, count: 2 }] })).toBeNull();
    expect(parseCardScheduleSummary({ ...valid, ease_by_deck: [{ deck_id: 'd1', mean_ease: 'x' }] })).toBeNull();
    expect(parseCardScheduleSummary({ ...valid, oldest_overdue_at: 42 })).toBeNull();
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
