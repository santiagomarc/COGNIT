import { describe, expect, it } from 'vitest';
import { clusterFromCards, pairKey, randomClusters, selectDrillClusters, type ClusterCard } from './clusters';

function card(id: string, term: string, tags: string[]): ClusterCard {
  return { id, term, definition: `definition of ${term}`, explanation: null, tags };
}

// Deterministic "random": a fixed sequence, so tie-breaks are reproducible.
function sequence(values: number[]) {
  let index = 0;
  return () => values[index++ % values.length];
}

const CARDS = [
  card('a', 'Time quantum', ['scheduling', 'cpu']),
  card('b', 'Context switch', ['scheduling', 'cpu']),
  card('c', 'Convoy effect', ['scheduling']),
  card('d', 'Page fault', ['memory']),
  card('e', 'TLB', ['memory', 'cpu']),
  card('f', 'Deadlock', ['concurrency']),
];

describe('pairKey', () => {
  it('is order-independent', () => {
    expect(pairKey(['b', 'a'])).toBe(pairKey(['a', 'b']));
    expect(pairKey(['c', 'a', 'b'])).toBe('a|b|c');
  });
});

describe('selectDrillClusters', () => {
  it('prefers pairs sharing rare tags over pairs sharing common ones', () => {
    // a–b share 'scheduling' (freq 3) and 'cpu' (freq 3): weight 2/3.
    // d–e share only 'memory' (freq 2): weight 1/2. a–b wins.
    const clusters = selectDrillClusters({ cards: CARDS, existingClusterKeys: new Set(), count: 1, random: sequence([0.5]) });
    expect(clusters).toHaveLength(1);
    expect(clusters[0].cards.map((c) => c.id)).toEqual(expect.arrayContaining(['a', 'b']));
    expect(clusters[0].clustering).toBe('tags');
  });

  it('extends a pair to a triple only with a card that relates to BOTH', () => {
    const clusters = selectDrillClusters({ cards: CARDS, existingClusterKeys: new Set(), count: 1, random: sequence([0.5]) });
    // c shares 'scheduling' with both a and b; e shares 'cpu' with both too.
    // Either is a valid third; what matters is that a related third was added.
    expect(clusters[0].cards).toHaveLength(3);
    expect(clusters[0].cards.map((c) => c.id)).toEqual(expect.arrayContaining(['a', 'b']));
  });

  it('never reuses a pair that already has a drill, and never puts one card in two clusters', () => {
    const existing = new Set([pairKey(['a', 'b'])]);
    const clusters = selectDrillClusters({ cards: CARDS, existingClusterKeys: existing, count: 5, random: sequence([0.5]) });
    const seen = new Set<string>();
    for (const cluster of clusters) {
      expect(existing.has(pairKey(cluster.cards.map((c) => c.id)))).toBe(false);
      for (const c of cluster.cards) {
        expect(seen.has(c.id)).toBe(false);
        seen.add(c.id);
      }
    }
  });

  it('names the cluster by its rarest shared tag', () => {
    const clusters = selectDrillClusters({ cards: CARDS, existingClusterKeys: new Set(), count: 1, random: sequence([0.5]) });
    // a–b share 'scheduling' and 'cpu', both freq 3 — the tie keeps whichever
    // sorts first; assert it is one of the shared tags rather than a foreign one.
    expect(['scheduling', 'cpu']).toContain(clusters[0].topicTag);
  });

  it('restricts to a focus topic when given', () => {
    const clusters = selectDrillClusters({ cards: CARDS, existingClusterKeys: new Set(), count: 3, focusTopic: 'Memory', random: sequence([0.5]) });
    expect(clusters).toHaveLength(1);
    expect(clusters[0].cards.map((c) => c.id)).toEqual(expect.arrayContaining(['d', 'e']));
  });

  it('returns nothing when no two cards share a tag', () => {
    const lonely = [card('x', 'X', ['one']), card('y', 'Y', ['two']), card('z', 'Z', [])];
    expect(selectDrillClusters({ cards: lonely, existingClusterKeys: new Set(), count: 2 })).toEqual([]);
  });
});

describe('randomClusters', () => {
  it('pairs cards without repeating an existing drill', () => {
    const existing = new Set([pairKey(['a', 'b'])]);
    const clusters = randomClusters({ cards: CARDS.slice(0, 4), existingClusterKeys: existing, count: 2, random: sequence([0]) });
    for (const cluster of clusters) {
      expect(cluster.cards).toHaveLength(2);
      expect(cluster.clustering).toBe('random');
      expect(existing.has(pairKey(cluster.cards.map((c) => c.id)))).toBe(false);
    }
  });
});

describe('clusterFromCards', () => {
  it('dedupes, caps at three and refuses fewer than two', () => {
    const a = card('a', 'A', []);
    expect(clusterFromCards([a, a], 'embedding')).toBeNull();
    const cluster = clusterFromCards([a, card('b', 'B', []), card('c', 'C', []), card('d', 'D', [])], 'embedding');
    expect(cluster?.cards.map((c) => c.id)).toEqual(['a', 'b', 'c']);
    expect(cluster?.clustering).toBe('embedding');
  });
});
