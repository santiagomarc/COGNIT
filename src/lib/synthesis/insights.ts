/**
 * Readings and the Weak-links aggregation (spec §8.5). Pure: the loaders
 * hand in a bounded read of attempts and drills, and nothing here touches
 * the database. No RPC — the same trade `loadScheduleBreakdown` makes.
 */

import type { Confidence, DrillReadingRow, DrillVerdict, LinkCoverage, SynthesisReadings, WeakLinkRow } from '@/lib/synthesis/types';

export type AttemptForInsights = {
  drillId: string;
  createdAt: string;
  coverage: LinkCoverage[];
  missingCardIds: string[];
  contradictedCardIds: string[];
  outsideClaimCount: number;
};

export const WEAK_LINK_MIN_SIGNALS = 2;

/**
 * `DUE n · LINKS a/b · LAST`, from the drill rows alone (audit P1): each
 * active drill carries its key's size and its latest attempt's covered
 * count, so the launcher never reads the attempts table. A drill never
 * attempted contributes 0 / n.
 */
export function deckReadings(input: { rows: DrillReadingRow[]; now: Date }): SynthesisReadings {
  const active = input.rows.filter((row) => row.status === 'active');
  const nowMs = input.now.getTime();
  let linksCovered = 0;
  let linksTotal = 0;
  let lastAttemptAt: string | null = null;
  for (const row of active) {
    linksTotal += row.linkCount;
    linksCovered += row.lastLinksCovered ?? 0;
    if (row.lastAttemptAt && (lastAttemptAt === null || row.lastAttemptAt > lastAttemptAt)) lastAttemptAt = row.lastAttemptAt;
  }

  return {
    activeDrills: active.length,
    due: active.filter((row) => new Date(row.nextDueAt).getTime() <= nowMs).length,
    linksCovered,
    linksTotal,
    lastAttemptAt,
  };
}

/**
 * Calibration (audit F1): the share of attempts whose confidence matched the
 * verdict — *sure* and sound, *unsure* and not sound; *fairly sure* always
 * counts as matched, it is the honest middle. Null until there are attempts
 * with a confidence at all.
 */
export function calibrationRate(attempts: { confidence: Confidence | null; verdict: DrillVerdict }[]): number | null {
  const rated = attempts.filter((attempt) => attempt.confidence !== null && attempt.verdict !== 'off_target');
  if (rated.length === 0) return null;
  const matched = rated.filter((attempt) =>
    attempt.confidence === 2
    || (attempt.confidence === 3 && attempt.verdict === 'sound')
    || (attempt.confidence === 1 && attempt.verdict !== 'sound'),
  ).length;
  return matched / rated.length;
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
