import { describe, expect, it } from 'vitest';
import { QUERY_CARD_FLOOR, questionMatches } from '@/lib/similarity';

describe('questionMatches', () => {
  it('maps nothing when even the best card is below the query floor (off-topic question)', () => {
    // "Analyse the use of imagery in Macbeth" against an operating-systems deck.
    const rows = [0.497, 0.489, 0.481, 0.47, 0.468, 0.462, 0.458, 0.451].map((similarity, index) => ({ id: `c${index}`, similarity }));
    expect(questionMatches(rows)).toEqual([]);
  });

  it('keeps only the band under the best match for a covered question', () => {
    const rows = [
      { id: 'quantum', similarity: 0.731 },
      { id: 'round-robin', similarity: 0.702 },
      { id: 'context-switch', similarity: 0.668 },
      { id: 'convoy', similarity: 0.604 },
    ];
    expect(questionMatches(rows)).toEqual(['quantum', 'round-robin']);
  });

  it('never drops below the query floor, however close the band', () => {
    const rows = [
      { id: 'a', similarity: QUERY_CARD_FLOOR + 0.01 },
      { id: 'b', similarity: QUERY_CARD_FLOOR - 0.01 },
    ];
    expect(questionMatches(rows)).toEqual(['a']);
  });

  it('ignores rows without a similarity', () => {
    expect(questionMatches([{ id: 'x', similarity: null }])).toEqual([]);
  });
});
