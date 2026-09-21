/**
 * Readings and the Weak-links aggregation (spec §8.5). Pure: the loaders
 * hand in a bounded read of attempts and drills, and nothing here touches
 * the database. No RPC — the same trade `loadScheduleBreakdown` makes.
 */

import type { Confidence, DrillReadingRow, DrillVerdict, LinkCoverage, MisconceptionKind, SynthesisFormat, SynthesisReadings, WeakLinkRow } from '@/lib/synthesis/types';

export type AttemptForInsights = {
  drillId: string;
  createdAt: string;
  coverage: LinkCoverage[];
  missingCardIds: string[];
  contradictedCardIds: string[];
  outsideClaimCount: number;
  verdict?: DrillVerdict;
  format?: SynthesisFormat;
  confidence?: Confidence | null;
  contradictionKinds?: MisconceptionKind[];
};

export type FormatRateRow = { format: SynthesisFormat; attempts: number; sound: number };
export type DailyPoint = { date: string; attempts: number; linksCovered: number; linksTotal: number };

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
    plans: { active: 0, due: 0 },
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

/** Attempts and sound verdicts per format (audit U6): which kind of question the student can already answer. */
export function formatSoundRates(attempts: AttemptForInsights[]): FormatRateRow[] {
  const rows = new Map<SynthesisFormat, FormatRateRow>();
  for (const attempt of attempts) {
    if (!attempt.format || !attempt.verdict || attempt.verdict === 'off_target') continue;
    const row = rows.get(attempt.format) ?? { format: attempt.format, attempts: 0, sound: 0 };
    row.attempts += 1;
    if (attempt.verdict === 'sound') row.sound += 1;
    rows.set(attempt.format, row);
  }
  return [...rows.values()].sort((a, b) => b.attempts - a.attempts);
}

/** How many verified contradictions of each kind, inside the window (audit G7). */
export function misconceptionCounts(attempts: AttemptForInsights[], since: Date): Partial<Record<MisconceptionKind, number>> {
  const sinceIso = since.toISOString();
  const counts: Partial<Record<MisconceptionKind, number>> = {};
  for (const attempt of attempts) {
    if (attempt.createdAt < sinceIso) continue;
    for (const kind of attempt.contradictionKinds ?? []) counts[kind] = (counts[kind] ?? 0) + 1;
  }
  return counts;
}

/**
 * One point per day for the last `days` days (UTC), oldest first: how many
 * links were covered out of how many asked — the number a sparkline shows
 * climbing. Days without attempts are present with zeros so the line has a
 * fixed width.
 */
export function dailyLinkSeries(attempts: AttemptForInsights[], now: Date, days = 30): DailyPoint[] {
  const byDate = new Map<string, DailyPoint>();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - 1)));
  for (let index = 0; index < days; index += 1) {
    const day = new Date(start.getTime() + index * 86_400_000);
    const date = day.toISOString().slice(0, 10);
    byDate.set(date, { date, attempts: 0, linksCovered: 0, linksTotal: 0 });
  }
  for (const attempt of attempts) {
    const point = byDate.get(attempt.createdAt.slice(0, 10));
    if (!point) continue;
    point.attempts += 1;
    point.linksCovered += attempt.coverage.filter((entry) => entry.status === 'covered').length;
    point.linksTotal += attempt.coverage.length;
  }
  return [...byDate.values()];
}
