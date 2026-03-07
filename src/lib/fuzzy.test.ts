import { describe, expect, it } from 'vitest';
import { levenshteinDistance, similarity } from './fuzzy';

describe('levenshteinDistance', () => {
  it('returns 0 for exact matches', () => {
    expect(levenshteinDistance('mitochondria', 'mitochondria')).toBe(0);
  });

  it('is case and whitespace insensitive', () => {
    expect(levenshteinDistance('  Mitochondria  ', 'mitochondria')).toBe(0);
    expect(levenshteinDistance('cell   wall', 'cell wall')).toBe(0);
  });

  it('computes a basic edit distance', () => {
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
  });
});

describe('similarity', () => {
  it('returns 1 for exact matches', () => {
    expect(similarity('osmosis', 'osmosis')).toBe(1);
  });

  it('returns a high score for near matches', () => {
    expect(similarity('mitochondria', 'mitochodria')).toBeGreaterThanOrEqual(0.8);
  });

  it('returns a lower score for incorrect answers', () => {
    expect(similarity('mitochondria', 'chloroplast')).toBeLessThan(0.6);
  });

  it('treats empty strings as a perfect match only when both are empty', () => {
    expect(similarity('', '')).toBe(1);
    expect(similarity('term', '')).toBe(0);
  });
});