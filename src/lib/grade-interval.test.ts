import { describe, expect, it } from 'vitest';
import { formatInterval, projectedInterval } from './grade-interval';
import { defaultSM2, type SM2Input } from './sm2';

function buildCard(overrides: Partial<SM2Input> = {}): SM2Input {
  return { ...defaultSM2(), ...overrides };
}

describe('formatInterval', () => {
  const now = new Date('2026-09-09T12:00:00Z');

  it('reads sub-day delays off nextReviewAt, not the zero interval', () => {
    // SM-2 reports a failed review as interval 0 and puts the real delay in
    // nextReviewAt. Formatting the interval alone would render this as "0d".
    expect(formatInterval(0, new Date('2026-09-09T12:01:00Z'), now)).toBe('1m');
    expect(formatInterval(0, new Date('2026-09-09T12:10:00Z'), now)).toBe('10m');
  });

  it('switches to hours once a sub-day delay passes two hours', () => {
    expect(formatInterval(0, new Date('2026-09-09T15:00:00Z'), now)).toBe('3h');
  });

  it('never reports a delay of zero minutes', () => {
    expect(formatInterval(0, now, now)).toBe('1m');
  });

  it('formats days, months and years', () => {
    expect(formatInterval(1, new Date('2026-09-10T12:00:00Z'), now)).toBe('1d');
    expect(formatInterval(11, new Date('2026-09-20T12:00:00Z'), now)).toBe('11d');
    expect(formatInterval(90, new Date('2026-12-08T12:00:00Z'), now)).toBe('3mo');
    expect(formatInterval(365, new Date('2027-09-09T12:00:00Z'), now)).toBe('1y');
  });
});

describe('projectedInterval', () => {
  it('projects the real SM-2 learning steps for a new card', () => {
    const card = buildCard();

    // Grade 0 → the 1-minute step; grade 2 → the 10-minute step.
    expect(projectedInterval('again', card)).toBe('1m');
    expect(projectedInterval('hard', card)).toBe('10m');
    // First success on a new card schedules a day out.
    expect(projectedInterval('good', card)).toBe('1d');
  });

  it('gives easy the SM-2 30% stretch over good', () => {
    const card = buildCard({ state: 'review', repetitionCount: 4, interval: 10, easeFactor: 2.5 });

    // Good holds the ease factor at 2.5: 10 × 2.5 = 25.
    expect(projectedInterval('good', card)).toBe('25d');
    // Easy first lifts the ease factor to 2.6, so 10 × 2.6 = 26, then ×1.3.
    expect(projectedInterval('easy', card)).toBe('34d');
  });

  it('collapses a lapse back to the learning step regardless of prior interval', () => {
    const card = buildCard({ state: 'review', repetitionCount: 9, interval: 120, easeFactor: 2.6 });

    expect(projectedInterval('again', card)).toBe('1m');
  });

  it('caps at the scheduler ceiling rather than projecting past it', () => {
    const card = buildCard({ state: 'review', repetitionCount: 12, interval: 300, easeFactor: 2.5 });

    // 300 × 2.5 is clamped to MAX_INTERVAL_DAYS (365).
    expect(projectedInterval('good', card)).toBe('1y');
  });

  it('reports a distinct consequence for every key on a mature card', () => {
    const card = buildCard({ state: 'review', repetitionCount: 5, interval: 20, easeFactor: 2.4 });
    const shown = (['again', 'hard', 'good', 'easy'] as const).map((g) => projectedInterval(g, card));

    expect(new Set(shown).size).toBe(4);
  });
});
