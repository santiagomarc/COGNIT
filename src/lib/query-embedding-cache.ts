/**
 * Query embeddings, remembered per server instance (performance plan §7.3).
 * The same search typed twice costs one model call, not two. A query's vector
 * depends only on its text, so the cache holds no user data beyond what was
 * typed, and nothing is shared that a user could not compute for themselves.
 */

const MAX_ENTRIES = 200;
const TTL_MS = 10 * 60 * 1000;

const entries = new Map<string, { vector: number[]; at: number }>();

/** Case- and spacing-insensitive: "Krebs cycle" and "krebs  cycle" share an entry. */
export function queryCacheKey(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function getCachedQueryEmbedding(query: string, now = Date.now()): number[] | null {
  const key = queryCacheKey(query);
  const hit = entries.get(key);
  if (!hit) return null;
  if (now - hit.at > TTL_MS) {
    entries.delete(key);
    return null;
  }
  // Re-insert so iteration order tracks recency (Map keeps insertion order).
  entries.delete(key);
  entries.set(key, hit);
  return hit.vector;
}

export function cacheQueryEmbedding(query: string, vector: number[], now = Date.now()): void {
  const key = queryCacheKey(query);
  entries.delete(key);
  entries.set(key, { vector, at: now });
  while (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) break;
    entries.delete(oldest);
  }
}

/** Tests only. */
export function clearQueryEmbeddingCache(): void {
  entries.clear();
}
