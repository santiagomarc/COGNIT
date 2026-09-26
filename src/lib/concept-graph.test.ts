import { describe, expect, it } from 'vitest';
import { layoutConceptGraph, parseConceptGraph, type ConceptGraph } from '@/lib/concept-graph';

const node = (id: string) => ({ id, term: id.toUpperCase(), state: 'review' as const, contradicted: 0 });
const edge = (source: string, target: string, links = 1) => ({ source, target, links, covered: 0, partial: 0, missing: 0 });

/** Two triangles with no edge between them. */
const TWO_TRIANGLES: ConceptGraph = {
  nodes: ['a', 'b', 'c', 'x', 'y', 'z'].map(node),
  edges: [edge('a', 'b'), edge('b', 'c'), edge('a', 'c'), edge('x', 'y'), edge('y', 'z'), edge('x', 'z')],
};

const OPTIONS = { width: 1000, height: 520 };

describe('concept graph layout (plan §4.3)', () => {
  it('is deterministic: the same graph gives the same picture, whatever the input order', () => {
    const first = layoutConceptGraph(TWO_TRIANGLES, OPTIONS);
    const shuffled = layoutConceptGraph({ nodes: [...TWO_TRIANGLES.nodes].reverse(), edges: [...TWO_TRIANGLES.edges].reverse() }, OPTIONS);
    expect(shuffled).toEqual(first);
  });

  it('keeps every node inside the padded viewBox', () => {
    for (const positioned of layoutConceptGraph(TWO_TRIANGLES, { ...OPTIONS, padding: 48 })) {
      expect(positioned.x).toBeGreaterThanOrEqual(48);
      expect(positioned.x).toBeLessThanOrEqual(1000 - 48);
      expect(positioned.y).toBeGreaterThanOrEqual(48);
      expect(positioned.y).toBeLessThanOrEqual(520 - 48);
    }
  });

  it('draws linked concepts closer together than unlinked ones', () => {
    const at = new Map(layoutConceptGraph(TWO_TRIANGLES, OPTIONS).map((positioned) => [positioned.id, positioned]));
    const distance = (p: string, q: string) => Math.hypot(at.get(p)!.x - at.get(q)!.x, at.get(p)!.y - at.get(q)!.y);
    const within = Math.max(distance('a', 'b'), distance('b', 'c'), distance('a', 'c'), distance('x', 'y'), distance('y', 'z'), distance('x', 'z'));
    const across = Math.min(...['a', 'b', 'c'].flatMap((p) => ['x', 'y', 'z'].map((q) => distance(p, q))));
    expect(within).toBeLessThan(across);
  });

  it('weights degree by the number of drill links on each edge', () => {
    const laid = layoutConceptGraph({ nodes: ['a', 'b', 'c'].map(node), edges: [edge('a', 'b', 3), edge('b', 'c', 1)] }, OPTIONS);
    const degree = Object.fromEntries(laid.map((positioned) => [positioned.id, positioned.degree]));
    expect(degree).toEqual({ a: 3, b: 4, c: 1 });
  });

  it('rejects a malformed payload instead of drawing it', () => {
    expect(parseConceptGraph({ nodes: [{ id: 'a', term: 'A', state: 'mastered', contradicted: 0 }], edges: [] })).toBeNull();
    expect(parseConceptGraph(null)).toBeNull();
    expect(parseConceptGraph({ nodes: [node('a')], edges: [] })).not.toBeNull();
  });
});
