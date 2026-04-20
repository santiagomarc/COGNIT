import { describe, expect, it } from 'vitest';
import { GRADE_MAP, defaultSM2, sm2, type SM2Input } from './sm2';

function buildInput(overrides: Partial<SM2Input> = {}): SM2Input {
  return {
    repetitionCount: 0,
    easeFactor: 2.5,
    interval: 0,
    state: 'new',
    ...overrides,
  };
}

describe('sm2', () => {
  it('maps study grades to expected numeric SM-2 grades', () => {
    expect(GRADE_MAP.again).toBe(0);
    expect(GRADE_MAP.hard).toBe(2);
    expect(GRADE_MAP.good).toBe(4);
    expect(GRADE_MAP.easy).toBe(5);
  });

  it('resets schedule on failure and enters learning/relearning', () => {
    const failedNew = sm2(0, buildInput({ state: 'new', repetitionCount: 2, interval: 6, easeFactor: 2.5 }));
    expect(failedNew.repetitionCount).toBe(0);
    expect(failedNew.interval).toBe(0);
    expect(failedNew.state).toBe('learning');
    expect(failedNew.easeFactor).toBeCloseTo(2.3, 5);

    const failedReview = sm2(2, buildInput({ state: 'review', repetitionCount: 5, interval: 20, easeFactor: 2.6 }));
    expect(failedReview.state).toBe('relearning');
    expect(failedReview.repetitionCount).toBe(0);
    expect(failedReview.interval).toBe(0);
  });

  it('schedules hard failures later than again failures', () => {
    const again = sm2(0, buildInput({ state: 'review', repetitionCount: 4, interval: 12, easeFactor: 2.5 }));
    const hard = sm2(2, buildInput({ state: 'review', repetitionCount: 4, interval: 12, easeFactor: 2.5 }));

    expect(hard.nextReviewAt.getTime()).toBeGreaterThan(again.nextReviewAt.getTime() + 8 * 60_000);
  });

  it('applies first successful intervals from new cards (1 day then 6 days)', () => {
    const first = sm2(4, buildInput({ state: 'new', repetitionCount: 0, interval: 0 }));
    expect(first.interval).toBe(1);
    expect(first.repetitionCount).toBe(1);
    expect(first.state).toBe('review');

    const second = sm2(4, buildInput({ state: 'learning', repetitionCount: 1, interval: 1 }));
    expect(second.interval).toBe(6);
    expect(second.repetitionCount).toBe(2);
    expect(second.state).toBe('review');
  });

  it('applies easy bonus to interval growth', () => {
    const good = sm2(4, buildInput({ state: 'review', repetitionCount: 3, interval: 10, easeFactor: 2.5 }));
    const easy = sm2(5, buildInput({ state: 'review', repetitionCount: 3, interval: 10, easeFactor: 2.5 }));

    expect(easy.interval).toBeGreaterThan(good.interval);
  });

  it('guards invalid input values and enforces minimum ease factor', () => {
    const result = sm2(4, buildInput({
      repetitionCount: Number.NaN,
      easeFactor: 0.5,
      interval: Number.POSITIVE_INFINITY,
      state: 'review',
    }));

    expect(result.repetitionCount).toBeGreaterThanOrEqual(1);
    expect(result.easeFactor).toBeGreaterThanOrEqual(1.3);
    expect(result.interval).toBeGreaterThanOrEqual(0);
    expect(result.interval).toBeLessThanOrEqual(365);
  });
});

describe('defaultSM2', () => {
  it('returns a valid initial scheduling state', () => {
    expect(defaultSM2()).toEqual({
      repetitionCount: 0,
      easeFactor: 2.5,
      interval: 0,
      state: 'new',
    });
  });
});
