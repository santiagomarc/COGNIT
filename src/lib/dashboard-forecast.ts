/**
 * Dashboard derivations that are pure date/number work, kept out of the page so
 * they can be tested without a Supabase client.
 *
 * Both of these read the same single card projection — `deck_id`,
 * `ease_factor`, `next_review_at` — because the dashboard needs a seven-day
 * forecast *and* a per-deck mean ease, and fetching those separately would be
 * two passes over the same rows for no benefit.
 */

export type CardScheduleRow = {
  deck_id: string;
  ease_factor: number | null;
  next_review_at: string | null;
};

export type ForecastDay = {
  /** `YYYY-MM-DD`, UTC. */
  date: string;
  /** Cards falling due on that day. */
  count: number;
};

const DAY_MS = 86_400_000;

function toIsoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Seven columns starting **tomorrow**.
 *
 * This used to start today, with everything overdue folded into column 0. That
 * was defensible in isolation and unreadable on real data: at 519 due, today's
 * column is ~4.6x the tallest projected day, so every other bar collapses to a
 * stub and the chart stops answering the question it exists for — *when does
 * the rest arrive*. The forecast now sits inside the due-now band, where
 * today's figure is already the hero number a few inches away, so plotting it
 * twice bought nothing and cost the chart (Run 6, Task 2.5).
 *
 * Anything due today or overdue is therefore **not** in this window. It is not
 * lost: it is the `totalDue` reading the band leads with.
 */
export function buildSevenDayForecast(
  rows: CardScheduleRow[],
  now: Date = new Date(),
  days = 7
): ForecastDay[] {
  const todayStartMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const firstDayMs = todayStartMs + DAY_MS;

  const buckets = new Array<number>(days).fill(0);

  for (const row of rows) {
    if (!row.next_review_at) continue;

    const dueMs = Date.parse(row.next_review_at);
    if (Number.isNaN(dueMs)) continue;

    const dueDayMs = Date.UTC(
      new Date(dueMs).getUTCFullYear(),
      new Date(dueMs).getUTCMonth(),
      new Date(dueMs).getUTCDate()
    );

    const offset = Math.round((dueDayMs - firstDayMs) / DAY_MS);
    // Overdue and due-today fall before the window; they are the band's hero
    // figure, not a column here.
    if (offset < 0 || offset >= days) continue;

    buckets[offset] += 1;
  }

  return buckets.map((count, index) => ({
    date: toIsoDate(firstDayMs + index * DAY_MS),
    count,
  }));
}

/**
 * Mean SM-2 ease factor per deck — the most diagnostic single number a deck
 * has, because it says how hard the material is fighting back rather than how
 * much of it there is.
 *
 * Cards with no recorded ease are skipped rather than counted as zero, which
 * would drag a new deck's mean toward a difficulty it has not demonstrated.
 */
export function meanEaseByDeck(rows: CardScheduleRow[]): Map<string, number> {
  const totals = new Map<string, { sum: number; count: number }>();

  for (const row of rows) {
    if (typeof row.ease_factor !== 'number' || !Number.isFinite(row.ease_factor)) continue;

    const entry = totals.get(row.deck_id) ?? { sum: 0, count: 0 };
    entry.sum += row.ease_factor;
    entry.count += 1;
    totals.set(row.deck_id, entry);
  }

  const means = new Map<string, number>();
  for (const [deckId, { sum, count }] of totals) {
    means.set(deckId, sum / count);
  }
  return means;
}

/**
 * The oldest overdue card's age in whole days, or `null` when nothing is
 * overdue. It is the one number that says whether a backlog is a day old or a
 * month old, which a total on its own cannot.
 */
export function oldestOverdueDays(rows: CardScheduleRow[], now: Date = new Date()): number | null {
  const nowMs = now.getTime();
  let oldestMs: number | null = null;

  for (const row of rows) {
    if (!row.next_review_at) continue;
    const dueMs = Date.parse(row.next_review_at);
    if (Number.isNaN(dueMs) || dueMs > nowMs) continue;
    if (oldestMs === null || dueMs < oldestMs) oldestMs = dueMs;
  }

  if (oldestMs === null) return null;
  return Math.floor((nowMs - oldestMs) / DAY_MS);
}

/**
 * A session-length estimate for a due count, in whole minutes.
 *
 * Eight seconds a card is the floor the study client already assumes when it
 * spaces re-queued cards (`MIN_ASSUMED_MS_PER_CARD`), so the two agree rather
 * than each guessing separately.
 */
export function estimateSessionMinutes(dueCount: number, secondsPerCard = 8): number {
  if (dueCount <= 0) return 0;
  return Math.max(1, Math.round((dueCount * secondsPerCard) / 60));
}
