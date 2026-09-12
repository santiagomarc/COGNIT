import { describe, expect, it } from 'vitest';
import { aggregateWeakLinks, deckReadings, latestAttemptByDrill, linksCoveredLatest, outsideClaimsSince, type AttemptForInsights } from './insights';
import type { SynthesisDrill } from './types';

const NOW = new Date('2026-09-12T12:00:00Z');

function drill(id: string, links: number, overrides: Partial<SynthesisDrill> = {}): SynthesisDrill {
  return {
    id, deckId: 'deck', format: 'causal', promptText: 'p', cardIds: ['a', 'b'], topicTag: null,
    requiredLinks: Array.from({ length: links }, (_, i) => ({ id: `m${i + 1}`, text: 'l', cardIds: ['a'] })),
    exemplar: { claim: 'c', mechanisms: ['m', 'm'], tradeoff: 't' },
    status: 'active', step: 0, nextDueAt: NOW.toISOString(), attemptCount: 0, lastVerdict: null, lastAttemptAt: null,
    ...overrides,
  };
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

describe('latestAttemptByDrill / linksCoveredLatest', () => {
  it('uses only the newest attempt per drill and counts unattempted drills as 0/n', () => {
    const drills = [drill('d1', 3), drill('d2', 2), drill('archived', 4, { status: 'archived' })];
    const latest = latestAttemptByDrill([
      attempt('d1', '2026-09-10T00:00:00Z', 3, 3),
      attempt('d1', '2026-09-11T00:00:00Z', 1, 3),   // newer, worse — this one counts
    ]);
    expect(linksCoveredLatest(drills, latest)).toEqual({ covered: 1, total: 5 });
  });
});

describe('deckReadings', () => {
  it('reports active, due, links and the last attempt', () => {
    const later = new Date(NOW.getTime() + 36 * 60 * 60_000).toISOString();
    const readings = deckReadings({
      drills: [drill('d1', 2), drill('d2', 2, { nextDueAt: later })],
      attempts: [attempt('d1', '2026-09-11T00:00:00Z', 2, 2), attempt('d1', '2026-09-09T00:00:00Z', 0, 2)],
      now: NOW,
    });
    expect(readings).toEqual({ activeDrills: 2, due: 1, linksCovered: 2, linksTotal: 4, lastAttemptAt: '2026-09-11T00:00:00Z' });
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
