import { describe, expect, it } from 'vitest';
import {
  isEnumerationLike,
  isValidTermFront,
  pickBalancedCards,
  scoreCandidateCard,
  type CandidateCard,
} from './card-generation';

describe('isValidTermFront', () => {
  it.each([
    ['Photosynthesis', true],
    ['Krebs cycle', true],
    ['Adenosine triphosphate', true],
    ['What is photosynthesis?', false],          // question form
    ['Define entropy', false],                   // imperative
    ['The mitochondrion is the powerhouse of the cell', false],  // full sentence
    ['3.', false],                               // numbering artifact
    ['Photosynthesis:', false],                  // trailing punctuation
  ])('%s → %s', (front, expected) => {
    expect(isValidTermFront(front)).toBe(expected);
  });

  it('rejects a front that exceeds the hard word limit', () => {
    expect(isValidTermFront('one two three four five six seven')).toBe(false);
  });
});

describe('isEnumerationLike', () => {
  it('rejects numbered lists', () => {
    expect(isEnumerationLike('1. First step 2. Second step')).toBe(true);
  });

  it('rejects bulleted text', () => {
    expect(isEnumerationLike('- a bullet point')).toBe(true);
  });

  it('accepts prose definitions', () => {
    expect(isEnumerationLike('A process that converts light into chemical energy.')).toBe(false);
  });
});

describe('scoreCandidateCard', () => {
  it('prefers a short term that appears verbatim in the source', () => {
    const source = 'photosynthesis is the process by which plants convert light.';
    const strong = scoreCandidateCard(
      { front: 'Photosynthesis', back: 'The process by which plants convert light into energy.' },
      source,
    );
    const weak = scoreCandidateCard(
      { front: 'Some unrelated multi word phrase', back: 'Short.' },
      source,
    );
    expect(strong).toBeGreaterThan(weak);
  });

  it('penalises enumerated backs', () => {
    const source = 'steps of the process';
    const prose = scoreCandidateCard(
      { front: 'Glycolysis', back: 'A pathway that breaks down glucose into pyruvate.' },
      source,
    );
    const listy = scoreCandidateCard(
      { front: 'Glycolysis', back: '1. First 2. Second 3. Third' },
      source,
    );
    expect(prose).toBeGreaterThan(listy);
  });
});

describe('pickBalancedCards', () => {
  const card = (
    front: string,
    score: number,
    difficulty: CandidateCard['difficulty'],
  ): CandidateCard => ({ front, back: 'definition text', score, difficulty });

  it('returns everything when the pool is already small enough', () => {
    const pool = [card('A', 10, 'foundational'), card('B', 9, 'advanced')];
    expect(pickBalancedCards(pool, 5)).toHaveLength(2);
  });

  it('never exceeds maxCount', () => {
    const pool = Array.from({ length: 40 }, (_, i) => card(`F${i}`, 40 - i, 'foundational'));
    expect(pickBalancedCards(pool, 10)).toHaveLength(10);
  });

  it('keeps the highest-scoring advanced card when other bands over-fill', () => {
    // Regression for R-12: the old implementation pushed foundational →
    // intermediate → advanced then truncated, so the best advanced cards were
    // the first thing discarded.
    const pool = [
      card('TopAdvanced', 100, 'advanced'),
      ...Array.from({ length: 20 }, (_, i) => card(`F${i}`, 10 - i * 0.1, 'foundational')),
    ];
    expect(pickBalancedCards(pool, 5).map((c) => c.front)).toContain('TopAdvanced');
  });

  it('produces no duplicate fronts', () => {
    const pool = [
      card('Same', 10, 'foundational'),
      card('same', 9, 'intermediate'),
      card('Other', 8, 'advanced'),
    ];
    const fronts = pickBalancedCards(pool, 2).map((c) => c.front.toLowerCase());
    expect(new Set(fronts).size).toBe(fronts.length);
  });
});
