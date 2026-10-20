import { describe, expect, it } from 'vitest';
import { seededShuffle } from './seeded-shuffle';

const options = ['Mitosis', 'Meiosis', 'Osmosis', 'Diffusion'];

describe('seededShuffle', () => {
  it('gives the same order for the same seed (server and browser agree)', () => {
    expect(seededShuffle(options, 'quiz-1:card-a')).toEqual(seededShuffle(options, 'quiz-1:card-a'));
  });

  it('keeps every item exactly once and leaves the input alone', () => {
    const copy = [...options];
    expect([...seededShuffle(options, 'any')].sort()).toEqual([...options].sort());
    expect(options).toEqual(copy);
  });

  it('varies the order across seeds', () => {
    const orders = new Set(Array.from({ length: 20 }, (_, i) => seededShuffle(options, `quiz-${i}:card-a`).join('|')));
    expect(orders.size).toBeGreaterThan(5);
  });
});
