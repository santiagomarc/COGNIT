import { describe, expect, it } from 'vitest';
import { aggregateWeakLinks, calibrationRate, deckReadings, outsideClaimsSince, type AttemptForInsights } from './insights';
import type { DrillReadingRow } from './types';

const NOW = new Date('2026-09-12T12:00:00Z');

function row(overrides: Partial<DrillReadingRow> = {}): DrillReadingRow {
  return { status: 'active', nextDueAt: NOW.toISOString(), linkCount: 2, lastLinksCovered: null, lastAttemptAt: null, ...overrides };
}

function attempt(drillId: string, createdAt: string, covered: number, total: number, extra: Partial<AttemptForInsights> = {}): AttemptForInsights {
  return {
    drillId,
    createdAt,
    coverage: Array.from({ length: total }, (_, i) => ({ linkId: `m${i + 1}`, status: i < covered ? 'covered' : 'missing', evidence: null })),
    missingCardIds: [],
    contradictedCardIds: [],
    outsideClaimCount: 0,
    ...extra,
  };
}

describe('deckReadings', () => {
  it('reports active, due, links and the last attempt from the drill rows alone', () => {
    const later = new Date(NOW.getTime() + 36 * 60 * 60_000).toISOString();
    const readings = deckReadings({
      rows: [
        row({ linkCount: 2, lastLinksCovered: 2, lastAttemptAt: '2026-09-11T00:00:00Z' }),
        row({ linkCount: 3, nextDueAt: later, lastLinksCovered: 1, lastAttemptAt: '2026-09-10T00:00:00Z' }),
        row({ linkCount: 4 }),                                   // never attempted: 0 / 4
        row({ status: 'archived', linkCount: 4, lastLinksCovered: 4, lastAttemptAt: '2026-09-12T00:00:00Z' }),
      ],
      now: NOW,
    });
    expect(readings).toEqual({ activeDrills: 3, due: 2, linksCovered: 3, linksTotal: 9, lastAttemptAt: '2026-09-11T00:00:00Z' });
  });
});

describe('calibrationRate', () => {
  it('matches sure with sound and unsure with not-sound, counts fairly-sure as matched, ignores unrated and off-target', () => {
    expect(calibrationRate([])).toBeNull();
    expect(calibrationRate([{ confidence: null, verdict: 'sound' }])).toBeNull();
    expect(calibrationRate([
      { confidence: 3, verdict: 'sound' },        // matched
      { confidence: 3, verdict: 'partial' },      // overconfident
      { confidence: 1, verdict: 'partial' },      // matched
      { confidence: 2, verdict: 'contradicted' }, // matched
      { confidence: 3, verdict: 'off_target' },   // ignored
    ])).toBe(0.75);
  });
});

describe('outsideClaimsSince', () => {
  it('sums outside claims inside the window only', () => {
    const attempts = [
      attempt('d', '2026-09-11T00:00:00Z', 0, 1, { outsideClaimCount: 2 }),
      attempt('d', '2026-07-01T00:00:00Z', 0, 1, { outsideClaimCount: 5 }),
    ];
    expect(outsideClaimsSince(attempts, new Date('2026-08-13T00:00:00Z'))).toBe(2);
  });
});

describe('aggregateWeakLinks', () => {
  const terms = new Map([['a', 'Time quantum'], ['b', 'Convoy effect']]);

  it('lists cards at two or more signals, contradictions first, and skips deleted cards', () => {
    const rows = aggregateWeakLinks([
      attempt('d', '2026-09-10T00:00:00Z', 0, 1, { missingCardIds: ['a', 'b'], contradictedCardIds: [] }),
      attempt('d', '2026-09-11T00:00:00Z', 0, 1, { missingCardIds: ['a'], contradictedCardIds: ['b'] }),
      attempt('d', '2026-09-11T06:00:00Z', 0, 1, { missingCardIds: ['gone'], contradictedCardIds: ['gone'] }),
    ], terms);
    expect(rows).toEqual([
      { cardId: 'b', term: 'Convoy effect', missing: 1, contradicted: 1, lastAt: '2026-09-11T00:00:00Z' },
      { cardId: 'a', term: 'Time quantum', missing: 2, contradicted: 0, lastAt: '2026-09-11T00:00:00Z' },
    ]);
  });

  it('omits cards with a single signal', () => {
    expect(aggregateWeakLinks([attempt('d', '2026-09-10T00:00:00Z', 0, 1, { missingCardIds: ['a'] })], terms)).toEqual([]);
  });
});
