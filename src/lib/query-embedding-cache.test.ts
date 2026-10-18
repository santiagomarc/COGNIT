import { beforeEach, describe, expect, it } from 'vitest';
import { cacheQueryEmbedding, clearQueryEmbeddingCache, getCachedQueryEmbedding, queryCacheKey } from './query-embedding-cache';

describe('query embedding cache', () => {
  beforeEach(() => clearQueryEmbeddingCache());

  it('returns a stored vector for the same query, ignoring case and spacing', () => {
    cacheQueryEmbedding('Krebs cycle', [0.1, 0.2], 1_000);
    expect(queryCacheKey('  krebs   CYCLE ')).toBe('krebs cycle');
    expect(getCachedQueryEmbedding('krebs  cycle', 2_000)).toEqual([0.1, 0.2]);
  });

  it('forgets an entry after ten minutes', () => {
    cacheQueryEmbedding('osmosis', [1], 0);
    expect(getCachedQueryEmbedding('osmosis', 10 * 60 * 1000 + 1)).toBeNull();
  });

  it('evicts the least recently used entry past 200', () => {
    for (let i = 0; i < 200; i += 1) cacheQueryEmbedding(`q${i}`, [i], 1_000);
    getCachedQueryEmbedding('q0', 1_001); // touch: q1 is now the oldest
    cacheQueryEmbedding('q200', [200], 1_002);
    expect(getCachedQueryEmbedding('q0', 1_003)).toEqual([0]);
    expect(getCachedQueryEmbedding('q1', 1_003)).toBeNull();
  });
});
