import { describe, expect, it } from 'vitest';
import { summariseNextReviews } from '@/lib/study';

const NOW = new Date('2026-09-07T12:00:00Z').getTime();
const inDays = (days: number) => new Date(NOW + days * 86_400_000).toISOString();

describe('summariseNextReviews', () => {
  it('returns null when nothing was graded', () => {
    expect(summariseNextReviews([], NOW)).toBeNull();
  });

  it('describes a single bucket', () => {
    expect(summariseNextReviews([inDays(1), inDays(1)], NOW)).toBe('2 cards tomorrow');
  });

  it('uses the singular for one card', () => {
    expect(summariseNextReviews([inDays(1)], NOW)).toBe('1 card tomorrow');
  });

  it('joins the two nearest buckets, nearest first', () => {
    const summary = summariseNextReviews(
      [inDays(6), inDays(1), inDays(1), inDays(6), inDays(6)],
      NOW,
    );
    expect(summary).toBe('2 cards tomorrow · 3 cards in 6 days');
  });

  it('shows at most two buckets', () => {
    const summary = summariseNextReviews([inDays(1), inDays(2), inDays(3), inDays(4)], NOW);
    expect(summary?.split('·')).toHaveLength(2);
  });

  it('describes a same-day relearning step as "later today"', () => {
    // SM-2 reschedules a failed card minutes later, not days.
    expect(summariseNextReviews([new Date(NOW + 2 * 60_000).toISOString()], NOW))
      .toBe('1 card later today');
  });

  it('ignores unparseable timestamps', () => {
    expect(summariseNextReviews(['not-a-date', inDays(1)], NOW)).toBe('1 card tomorrow');
  });
});
