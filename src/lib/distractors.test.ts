import { describe, expect, it } from 'vitest';
import { selectUsableDistractors } from '@/lib/distractors';

describe('selectUsableDistractors', () => {
  it('accepts three distinct plausible distractors', () => {
    expect(selectUsableDistractors(['Meiosis', 'Apoptosis', 'Cytokinesis'], 'Mitosis'))
      .toEqual(['Meiosis', 'Apoptosis', 'Cytokinesis']);
  });

  it('rejects a distractor identical to the correct answer', () => {
    // This is the case that rendered two options as "correct" and produced a
    // duplicate React key in MCQMode.
    expect(selectUsableDistractors(['Mitosis', 'Meiosis', 'Apoptosis'], 'Mitosis')).toEqual([]);
  });

  it('rejects a near-duplicate of the answer differing only by case and space', () => {
    expect(selectUsableDistractors(['mitosis ', 'Meiosis', 'Apoptosis'], 'Mitosis')).toEqual([]);
  });

  it('rejects duplicate distractors', () => {
    expect(selectUsableDistractors(['Meiosis', 'meiosis', 'Apoptosis'], 'Mitosis')).toEqual([]);
  });

  it('requires exactly three — a 3-option MCQ is materially easier', () => {
    expect(selectUsableDistractors(['Meiosis', 'Apoptosis'], 'Mitosis')).toEqual([]);
  });

  it('takes the first three when the model over-delivers', () => {
    expect(selectUsableDistractors(
      ['Meiosis', 'Apoptosis', 'Cytokinesis', 'Autophagy'],
      'Mitosis',
    )).toEqual(['Meiosis', 'Apoptosis', 'Cytokinesis']);
  });

  it('drops blank and oversized entries', () => {
    expect(selectUsableDistractors(['  ', 'x'.repeat(250), 'Meiosis'], 'Mitosis')).toEqual([]);
  });

  it('handles a missing answer without crashing', () => {
    expect(selectUsableDistractors(['A', 'B', 'C'], '')).toHaveLength(3);
  });
});
