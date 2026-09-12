/**
 * Readings and the Weak-links aggregation (spec §8.5). Pure: the loaders
 * hand in a bounded read of attempts and drills, and nothing here touches
 * the database. No RPC — the same trade `loadScheduleBreakdown` makes.
 */

import type { LinkCoverage, SynthesisDrill, SynthesisReadings, WeakLinkRow } from '@/lib/synthesis/types';

export type AttemptForInsights = {
  drillId: string;
  createdAt: string;
  coverage: LinkCoverage[];
  missingCardIds: string[];
  contradictedCardIds: string[];
  outsideClaimCount: number;
};

export const WEAK_LINK_MIN_SIGNALS = 2;

/** Newest attempt per drill; `attempts` may be in any order. */
export function latestAttemptByDrill<T extends { drillId: string; createdAt: string }>(attempts: T[]): Map<string, T> {
  const latest = new Map<string, T>();
  for (const attempt of attempts) {
    const current = latest.get(attempt.drillId);
    if (!current || current.createdAt < attempt.createdAt) latest.set(attempt.drillId, attempt);
  }
  return latest;
}

/**
 * `LINKS a/b`: over each active drill's latest attempt, covered links over
 * required links. A drill never attempted contributes 0 / n.
 */
export function linksCoveredLatest(
  drills: SynthesisDrill[],
  latest: ReadonlyMap<string, { coverage: LinkCoverage[] }>,
): { covered: number; total: number } {
  let covered = 0;
  let total = 0;
  for (const drill of drills) {
    if (drill.status !== 'active') continue;
    total += drill.requiredLinks.length;
    const attempt = latest.get(drill.id);
    if (attempt) covered += attempt.coverage.filter((entry) => entry.status === 'covered').length;
  }
  return { covered, total };
}

export function deckReadings(input: {
  drills: SynthesisDrill[];
  attempts: AttemptForInsights[];
  now: Date;
}): SynthesisReadings {
  const active = input.drills.filter((drill) => drill.status === 'active');
  const nowMs = input.now.getTime();
  const latest = latestAttemptByDrill(input.attempts);
  const links = linksCoveredLatest(active, latest);
  const lastAttemptAt = input.attempts.reduce<string | null>(
    (best, attempt) => (best === null || attempt.createdAt > best ? attempt.createdAt : best),
    null,
  );

  return {
    activeDrills: active.length,
    due: active.filter((drill) => new Date(drill.nextDueAt).getTime() <= nowMs).length,
    linksCovered: links.covered,
    linksTotal: links.total,
    lastAttemptAt,
  };
}

export function outsideClaimsSince(attempts: AttemptForInsights[], since: Date): number {
  const sinceIso = since.toISOString();
  return attempts.filter((attempt) => attempt.createdAt >= sinceIso).reduce((sum, attempt) => sum + attempt.outsideClaimCount, 0);
}

/**
 * Per card: how often a link citing it went missing, and how often a
 * verified contradiction named it. Listed at ≥ WEAK_LINK_MIN_SIGNALS, sorted
 * by contradictions then misses.
 */
export function aggregateWeakLinks(
  attempts: AttemptForInsights[],
  termById: ReadonlyMap<string, string>,
): WeakLinkRow[] {
  const rows = new Map<string, WeakLinkRow>();
  const bump = (cardId: string, field: 'missing' | 'contradicted', at: string) => {
    const term = termById.get(cardId);
    if (!term) return; // the card no longer exists
    const row = rows.get(cardId) ?? { cardId, term, missing: 0, contradicted: 0, lastAt: at };
    row[field] += 1;
    if (at > row.lastAt) row.lastAt = at;
    rows.set(cardId, row);
  };

  for (const attempt of attempts) {
    for (const cardId of attempt.missingCardIds) bump(cardId, 'missing', attempt.createdAt);
    for (const cardId of attempt.contradictedCardIds) bump(cardId, 'contradicted', attempt.createdAt);
  }

  return [...rows.values()]
    .filter((row) => row.missing + row.contradicted >= WEAK_LINK_MIN_SIGNALS)
    .sort((a, b) => b.contradicted - a.contradicted || b.missing - a.missing || (a.lastAt < b.lastAt ? 1 : -1));
}
