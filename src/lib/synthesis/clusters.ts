/**
 * Anchor selection for drill generation (spec §6.1). Pure.
 *
 * A drill needs 2-3 cards that are actually related. Topic tags (AI
 * enrichment) are the primary signal: rare shared tags are more specific than
 * common ones, so a pair's weight is Σ 1/freq(tag) over the tags it shares.
 * The embedding and random fallbacks are assembled by the caller (they need
 * the database) and normalised through `clusterFromCards`.
 */

export type ClusterCard = {
  id: string;
  term: string;
  definition: string;
  explanation: string | null;
  tags: string[];
};

export type Clustering = 'tags' | 'embedding' | 'random';

export type DrillCluster = {
  cards: ClusterCard[];
  topicTag: string | null;
  clustering: Clustering;
};

export const MIN_DECK_CARDS_FOR_DRILLS = 6;
export const MAX_ACTIVE_DRILLS_PER_DECK = 40;

/** Order-independent identity of a cluster, for "never generate this pair twice". */
export function pairKey(ids: readonly string[]): string {
  return [...ids].sort().join('|');
}

export function normaliseTag(tag: string): string {
  return tag.trim().toLowerCase();
}

function normalisedTags(card: ClusterCard): string[] {
  return [...new Set(card.tags.map(normaliseTag).filter((tag) => tag.length > 0))];
}

type WeightedPair = { a: ClusterCard; b: ClusterCard; weight: number; shared: string[]; tiebreak: number };

export function selectDrillClusters(input: {
  cards: ClusterCard[];
  existingClusterKeys: ReadonlySet<string>;
  count: number;
  focusTopic?: string;
  random?: () => number;
}): DrillCluster[] {
  const random = input.random ?? Math.random;
  const focus = input.focusTopic ? normaliseTag(input.focusTopic) : null;
  const tagsById = new Map(input.cards.map((card) => [card.id, normalisedTags(card)]));

  const freq = new Map<string, number>();
  for (const tags of tagsById.values()) {
    for (const tag of tags) freq.set(tag, (freq.get(tag) ?? 0) + 1);
  }

  const weightOf = (shared: string[]) => shared.reduce((sum, tag) => sum + 1 / (freq.get(tag) ?? 1), 0);
  const sharedTags = (x: ClusterCard, y: ClusterCard) => {
    const ys = new Set(tagsById.get(y.id) ?? []);
    return (tagsById.get(x.id) ?? []).filter((tag) => ys.has(tag));
  };

  const pairs: WeightedPair[] = [];
  for (let i = 0; i < input.cards.length; i += 1) {
    for (let j = i + 1; j < input.cards.length; j += 1) {
      const a = input.cards[i];
      const b = input.cards[j];
      const shared = sharedTags(a, b);
      if (shared.length === 0) continue;
      if (focus && !shared.includes(focus)) continue;
      if (input.existingClusterKeys.has(pairKey([a.id, b.id]))) continue;
      pairs.push({ a, b, weight: weightOf(shared), shared, tiebreak: random() });
    }
  }

  pairs.sort((x, y) => y.weight - x.weight || x.tiebreak - y.tiebreak);

  const used = new Set<string>();
  const clusters: DrillCluster[] = [];

  for (const pair of pairs) {
    if (clusters.length >= input.count) break;
    if (used.has(pair.a.id) || used.has(pair.b.id)) continue;

    // Extend to a triple only with a card that relates to BOTH; the prompt
    // has to name every concept, so a loosely attached third is worse than none.
    let third: ClusterCard | null = null;
    let thirdWeight = 0;
    for (const candidate of input.cards) {
      if (used.has(candidate.id) || candidate.id === pair.a.id || candidate.id === pair.b.id) continue;
      const withA = sharedTags(candidate, pair.a);
      const withB = sharedTags(candidate, pair.b);
      if (withA.length === 0 || withB.length === 0) continue;
      const weight = weightOf(withA) + weightOf(withB);
      if (weight > thirdWeight) {
        third = candidate;
        thirdWeight = weight;
      }
    }

    const cards = third ? [pair.a, pair.b, third] : [pair.a, pair.b];
    if (third && input.existingClusterKeys.has(pairKey(cards.map((card) => card.id)))) {
      // The triple already exists as a drill; fall back to the pair.
      cards.pop();
    }

    for (const card of cards) used.add(card.id);

    // The rarest shared tag names the cluster.
    const topicTag = [...pair.shared].sort((x, y) => (freq.get(x) ?? 0) - (freq.get(y) ?? 0))[0] ?? null;
    clusters.push({ cards, topicTag, clustering: 'tags' });
  }

  return clusters;
}

/** Random pairs, for decks with neither tags nor embeddings. */
export function randomClusters(input: {
  cards: ClusterCard[];
  existingClusterKeys: ReadonlySet<string>;
  count: number;
  random?: () => number;
}): DrillCluster[] {
  const random = input.random ?? Math.random;
  const pool = [...input.cards];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [pool[index], pool[swap]] = [pool[swap], pool[index]];
  }

  const clusters: DrillCluster[] = [];
  for (let index = 0; index + 1 < pool.length && clusters.length < input.count; index += 2) {
    const cards = [pool[index], pool[index + 1]];
    if (input.existingClusterKeys.has(pairKey(cards.map((card) => card.id)))) continue;
    clusters.push({ cards, topicTag: null, clustering: 'random' });
  }
  return clusters;
}

/** Normalises a caller-assembled group (embedding neighbours) into a cluster. */
export function clusterFromCards(cards: ClusterCard[], clustering: Clustering): DrillCluster | null {
  const unique = cards.filter((card, index, all) => all.findIndex((other) => other.id === card.id) === index).slice(0, 3);
  if (unique.length < 2) return null;
  return { cards: unique, topicTag: null, clustering };
}
