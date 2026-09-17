import { z } from 'zod';

/**
 * The Analytics Hub's data contract (improvement plan §4.1): the JSONB that
 * `get_analytics_snapshot` returns, parsed strictly so a shape change fails
 * loudly on the server instead of rendering NaN. Same discipline as
 * `parseCardScheduleSummary`.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const retentionWeekSchema = z.object({
  week_start: isoDate,
  reviews: z.number().int().nonnegative(),
  pass_rate: z.number().min(0).max(1).nullable(),
  mean_ms: z.number().int().nonnegative().nullable(),
});

const loadDaySchema = z.object({
  due_date: isoDate,
  cards: z.number().int().nonnegative(),
});

const retrievabilityBucketSchema = z.object({
  bucket: z.number().int().min(1).max(10),
  cards: z.number().int().nonnegative(),
});

const topicMasterySchema = z.object({
  tag: z.string().min(1),
  cards: z.number().int().positive(),
  mean_ease: z.number().nullable(),
  lapse_rate: z.number().min(0).max(1).nullable(),
  mastered_share: z.number().min(0).max(1),
  unseen: z.number().int().nonnegative(),
  deck_id: z.string().uuid().nullable(),
});

const effortDaySchema = z.object({
  day: isoDate,
  minutes: z.coerce.number().nonnegative(),
  reviews: z.number().int().nonnegative(),
});

export const INTERVAL_BANDS = ['new', 'learning', '1-6d', '7-29d', '30-89d', '90d+'] as const;
export type IntervalBand = (typeof INTERVAL_BANDS)[number];

const intervalBandSchema = z.object({
  band: z.enum(INTERVAL_BANDS),
  cards: z.number().int().nonnegative(),
});

export const analyticsSnapshotSchema = z.object({
  generated_at: z.string(),
  retention_weekly: z.array(retentionWeekSchema),
  load_30d: z.array(loadDaySchema),
  retrievability: z.array(retrievabilityBucketSchema),
  topic_mastery: z.array(topicMasterySchema),
  effort: z.array(effortDaySchema),
  intervals: z.array(intervalBandSchema),
  totals: z.object({
    cards: z.number().int().nonnegative(),
    review_state: z.number().int().nonnegative(),
    mean_r_now: z.number().min(0).max(1).nullable(),
    at_risk_now: z.number().int().nonnegative(),
    at_risk_deck_id: z.string().uuid().nullable(),
    reviews_in_window: z.number().int().nonnegative(),
  }),
});

export type AnalyticsSnapshot = z.infer<typeof analyticsSnapshotSchema>;
export type RetentionWeek = z.infer<typeof retentionWeekSchema>;
export type TopicMastery = z.infer<typeof topicMasterySchema>;

export function parseAnalyticsSnapshot(value: unknown): AnalyticsSnapshot | null {
  const parsed = analyticsSnapshotSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Ten buckets, always, in order — the histogram must not collapse when a bucket is empty. */
export function retrievabilityHistogram(snapshot: Pick<AnalyticsSnapshot, 'retrievability'>): { bucket: number; label: string; cards: number; atRisk: boolean }[] {
  const byBucket = new Map(snapshot.retrievability.map((row) => [row.bucket, row.cards]));
  return Array.from({ length: 10 }, (_, index) => {
    const bucket = index + 1;
    const low = (bucket - 1) * 10;
    return {
      bucket,
      label: `${low}–${low + 10}%`,
      cards: byBucket.get(bucket) ?? 0,
      // Below 80 % predicted recall the card is more likely to lapse than not on a bad day.
      atRisk: bucket <= 8,
    };
  });
}

/**
 * Pass rate over the most recent N weeks that have data, weighted by review
 * count so a single-review week cannot dominate. Null when nothing qualifies.
 */
export function recentRetention(weeks: RetentionWeek[], lastN: number): number | null {
  const recent = [...weeks]
    .filter((week) => week.pass_rate !== null && week.reviews > 0)
    .sort((a, b) => b.week_start.localeCompare(a.week_start))
    .slice(0, Math.max(1, lastN));
  const reviews = recent.reduce((sum, week) => sum + week.reviews, 0);
  if (reviews === 0) return null;
  const passes = recent.reduce((sum, week) => sum + (week.pass_rate ?? 0) * week.reviews, 0);
  return passes / reviews;
}

/** Thirty consecutive UTC days from `from` (exclusive) with zero-filled counts. */
export function loadSeries(load: AnalyticsSnapshot['load_30d'], from: Date): { date: string; cards: number; weekend: boolean }[] {
  const byDate = new Map(load.map((row) => [row.due_date, row.cards]));
  const start = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  return Array.from({ length: 30 }, (_, offset) => {
    const day = new Date(start);
    day.setUTCDate(day.getUTCDate() + offset + 1);
    const iso = day.toISOString().slice(0, 10);
    const weekday = day.getUTCDay();
    return { date: iso, cards: byDate.get(iso) ?? 0, weekend: weekday === 0 || weekday === 6 };
  });
}

/** The tone a topic row takes: hue only where the number IS a state (§2.2). */
export function topicTone(topic: TopicMastery): 'mastered' | 'lapsed' | 'ink' {
  if ((topic.lapse_rate ?? 0) >= 0.3) return 'lapsed';
  if (topic.mastered_share >= 0.7) return 'mastered';
  return 'ink';
}

export function intervalBands(snapshot: Pick<AnalyticsSnapshot, 'intervals'>): { band: IntervalBand; cards: number; share: number }[] {
  const byBand = new Map(snapshot.intervals.map((row) => [row.band, row.cards]));
  const total = snapshot.intervals.reduce((sum, row) => sum + row.cards, 0);
  return INTERVAL_BANDS.map((band) => {
    const cards = byBand.get(band) ?? 0;
    return { band, cards, share: total > 0 ? cards / total : 0 };
  });
}
