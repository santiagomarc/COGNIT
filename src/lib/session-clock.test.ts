import { describe, expect, it } from 'vitest';
import { foldSegment, formatDuration } from './session-clock';

describe('foldSegment', () => {
  it('adds the running segment to the folded total', () => {
    expect(foldSegment(5_000, 10_000, 13_500)).toBe(8_500);
  });

  it('leaves a stopped clock alone', () => {
    expect(foldSegment(5_000, null, 99_000)).toBe(5_000);
  });

  it('never counts backwards when the system clock jumps', () => {
    expect(foldSegment(5_000, 10_000, 9_000)).toBe(5_000);
  });

  it('accumulates pause and resume segments', () => {
    let total = foldSegment(0, 0, 4_000);         // ran 4 s, paused
    total = foldSegment(total, 60_000, 63_000);   // resumed a minute later, ran 3 s
    expect(total).toBe(7_000);
  });
});

describe('formatDuration', () => {
  it('reads seconds, then minutes and seconds', () => {
    expect(formatDuration(42_900)).toBe('42s');
    expect(formatDuration(180_000)).toBe('3m');
    expect(formatDuration(187_000)).toBe('3m 7s');
  });
});
