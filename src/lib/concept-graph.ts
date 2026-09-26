import { z } from 'zod';

/*
 * The concept map's data (get_concept_graph, 202609240920) and its layout.
 * Parsing and layout run on the server; the client component receives
 * positioned nodes and imports only the types from here.
 */

const nodeSchema = z.object({
  id: z.string(),
  term: z.string(),
  state: z.enum(['new', 'learning', 'review', 'relearning']).nullable(),
  contradicted: z.number().int().nonnegative(),
});

const edgeSchema = z.object({
  source: z.string(),
  target: z.string(),
  links: z.number().int().positive(),
  covered: z.number().int().nonnegative(),
  partial: z.number().int().nonnegative(),
  missing: z.number().int().nonnegative(),
});

const graphSchema = z.object({ nodes: z.array(nodeSchema), edges: z.array(edgeSchema) });

export type ConceptNode = z.infer<typeof nodeSchema>;
export type ConceptEdge = z.infer<typeof edgeSchema>;
export type ConceptGraph = z.infer<typeof graphSchema>;
export type PositionedNode = ConceptNode & { x: number; y: number; degree: number };

export function parseConceptGraph(raw: unknown): ConceptGraph | null {
  const parsed = graphSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export type LayoutOptions = { width: number; height: number; iterations?: number; padding?: number };

/**
 * A deterministic force-directed layout (Fruchterman–Reingold), computed on
 * the server so the map ships as positioned SVG — no layout library, no
 * client work. Same graph in, same picture out: nodes start on a circle in id
 * order and every step is plain arithmetic, no Math.random.
 * O(n² · iterations): 60 nodes × 300 steps is ~0.5 M pair visits, a few ms.
 */
export function layoutConceptGraph(graph: ConceptGraph, options: LayoutOptions): PositionedNode[] {
  const { width, height, iterations = 300, padding = 48 } = options;
  const nodes = [...graph.nodes].sort((a, b) => a.id.localeCompare(b.id));
  const n = nodes.length;
  if (n === 0) return [];

  const index = new Map(nodes.map((node, i) => [node.id, i]));
  const degree = new Array<number>(n).fill(0);
  const springs: { a: number; b: number; weight: number }[] = [];
  for (const edge of graph.edges) {
    const a = index.get(edge.source);
    const b = index.get(edge.target);
    if (a === undefined || b === undefined || a === b) continue;
    springs.push({ a, b, weight: Math.min(3, edge.links) });
    degree[a] += edge.links;
    degree[b] += edge.links;
  }

  const k = Math.sqrt(((width - 2 * padding) * (height - 2 * padding)) / n);
  const pos = nodes.map((_, i) => {
    const angle = (2 * Math.PI * i) / n;
    return { x: width / 2 + (width / 3) * Math.cos(angle), y: height / 2 + (height / 3) * Math.sin(angle) };
  });

  let temperature = width / 8;
  const cooling = temperature / (iterations + 1);
  for (let step = 0; step < iterations; step += 1) {
    const disp = pos.map(() => ({ x: 0, y: 0 }));
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        let dx = pos[i].x - pos[j].x;
        let dy = pos[i].y - pos[j].y;
        let dist = Math.hypot(dx, dy);
        if (dist < 0.01) {
          dx = 0.01 * (j - i);
          dy = 0.01;
          dist = Math.hypot(dx, dy);
        }
        const push = (k * k) / dist;
        disp[i].x += (dx / dist) * push;
        disp[i].y += (dy / dist) * push;
        disp[j].x -= (dx / dist) * push;
        disp[j].y -= (dy / dist) * push;
      }
    }
    for (const { a, b, weight } of springs) {
      const dx = pos[a].x - pos[b].x;
      const dy = pos[a].y - pos[b].y;
      const dist = Math.max(0.01, Math.hypot(dx, dy));
      const pull = ((dist * dist) / k) * (0.5 + 0.25 * weight);
      disp[a].x -= (dx / dist) * pull;
      disp[a].y -= (dy / dist) * pull;
      disp[b].x += (dx / dist) * pull;
      disp[b].y += (dy / dist) * pull;
    }
    for (let i = 0; i < n; i += 1) {
      const length = Math.max(0.01, Math.hypot(disp[i].x, disp[i].y));
      const move = Math.min(length, temperature);
      pos[i].x = Math.min(width - padding, Math.max(padding, pos[i].x + (disp[i].x / length) * move));
      pos[i].y = Math.min(height - padding, Math.max(padding, pos[i].y + (disp[i].y / length) * move));
    }
    temperature -= cooling;
  }

  return nodes.map((node, i) => ({ ...node, x: Math.round(pos[i].x), y: Math.round(pos[i].y), degree: degree[i] }));
}
