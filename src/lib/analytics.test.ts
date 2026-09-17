import { describe, expect, it } from 'vitest';
import {
  intervalBands,
  loadSeries,
  parseAnalyticsSnapshot,
  recentRetention,
  retrievabilityHistogram,
  topicTone,
} from './analytics';

const EMPTY = {
  generated_at: '2026-09-17T00:00:00Z',
  retention_weekly: [],
  load_30d: [],
  retrievability: [],
  topic_mastery: [],
  effort: [],
  intervals: [],
  totals: { cards: 0, review_state: 0, mean_r_now: null, at_risk_now: 0, at_risk_deck_id: null, reviews_in_window: 0 },
};

describe('parseAnalyticsSnapshot', () => {
  it('accepts the empty account', () => {
    expect(parseAnalyticsSnapshot(EMPTY)).not.toBeNull();
  });

  it('rejects a shape drift instead of rendering NaN', () => {
    expect(parseAnalyticsSnapshot({ ...EMPTY, totals: { cards: 'many' } })).toBeNull();
    expect(parseAnalyticsSnapshot(null)).toBeNull();
  });

  it('coerces effort minutes, which Postgres returns as a numeric string', () => {
    const parsed = parseAnalyticsSnapshot({ ...EMPTY, effort: [{ day: '2026-09-10', minutes: '12.5', reviews: 40 }] });
    expect(parsed?.effort[0].minutes).toBe(12.5);
  });
});

describe('retrievabilityHistogram', () => {
  it('always yields ten ordered buckets and marks the at-risk ones', () => {
    const bars = retrievabilityHistogram({ retrievability: [{ bucket: 10, cards: 7 }, { bucket: 3, cards: 2 }] });
    expect(bars).toHaveLength(10);
    expect(bars[0]).toMatchObject({ bucket: 1, label: '0–10%', cards: 0, atRisk: true });
    expect(bars[2]).toMatchObject({ bucket: 3, cards: 2, atRisk: true });
    expect(bars[8]).toMatchObject({ bucket: 9, atRisk: false });
    expect(bars[9]).toMatchObject({ bucket: 10, cards: 7, atRisk: false });
  });
});

describe('recentRetention', () => {
  it('weights by reviews and ignores weeks without a rate', () => {
    const rate = recentRetention([
      { week_start: '2026-09-07', reviews: 10, pass_rate: 0.5, mean_ms: 1000 },
      { week_start: '2026-08-31', reviews: 90, pass_rate: 0.9, mean_ms: 1000 },
      { week_start: '2026-08-24', reviews: 0, pass_rate: null, mean_ms: null },
    ], 4);
    expect(rate).toBeCloseTo(0.86, 2);
  });

  it('is null with no reviews', () => {
    expect(recentRetention([], 4)).toBeNull();
  });

  it('takes only the most recent N weeks', () => {
    const rate = recentRetention([
      { week_start: '2026-09-07', reviews: 10, pass_rate: 1, mean_ms: 1 },
      { week_start: '2026-01-05', reviews: 1000, pass_rate: 0, mean_ms: 1 },
    ], 1);
    expect(rate).toBe(1);
  });
});

describe('loadSeries', () => {
  it('zero-fills thirty days after the anchor and flags weekends', () => {
    const series = loadSeries([{ due_date: '2026-09-19', cards: 4 }], new Date('2026-09-17T15:00:00Z'));
    expect(series).toHaveLength(30);
    expect(series[0].date).toBe('2026-09-18');
    expect(series[1]).toMatchObject({ date: '2026-09-19', cards: 4, weekend: true });   // a Saturday
    expect(series[2]).toMatchObject({ date: '2026-09-20', cards: 0, weekend: true });
    expect(series[3].weekend).toBe(false);
  });
});

describe('topicTone', () => {
  it('lapse rate outranks mastery, and hue is reserved for a state', () => {
    const base = { tag: 't', cards: 5, mean_ease: 2.5, unseen: 0, deck_id: null };
    expect(topicTone({ ...base, lapse_rate: 0.4, mastered_share: 0.9 })).toBe('lapsed');
    expect(topicTone({ ...base, lapse_rate: 0.1, mastered_share: 0.9 })).toBe('mastered');
    expect(topicTone({ ...base, lapse_rate: null, mastered_share: 0.2 })).toBe('ink');
  });
});

describe('intervalBands', () => {
  it('returns every band in order with its share of the collection', () => {
    const bands = intervalBands({ intervals: [{ band: '90d+', cards: 25 }, { band: 'new', cards: 75 }] });
    expect(bands.map((band) => band.band)).toEqual(['new', 'learning', '1-6d', '7-29d', '30-89d', '90d+']);
    expect(bands[0]).toMatchObject({ cards: 75, share: 0.75 });
    expect(bands[5]).toMatchObject({ cards: 25, share: 0.25 });
    expect(bands[1]).toMatchObject({ cards: 0, share: 0 });
  });
});
