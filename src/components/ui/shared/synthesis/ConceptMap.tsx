'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ConceptEdge, PositionedNode } from '@/lib/concept-graph';

export type ConceptMapProps = {
  deckId: string;
  /** Laid out on the server by `layoutConceptGraph`, in the viewBox below. */
  nodes: PositionedNode[];
  edges: ConceptEdge[];
  width: number;
  height: number;
};

type Relation = { id: string; term: string; status: 'holds' | 'weak' | 'untested' | 'mixed' };

const LABEL = 'font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer';

/**
 * How a relation is going, from the latest attempt on each drill that asks
 * for it. The hues follow the synthesis mapping of the state channel (design
 * system Rev. D): holds → mastered, keeps going missing → due; an untested
 * relation is a dashed hairline, never a colour.
 */
function relationStatus(edge: ConceptEdge): Relation['status'] {
  const seen = edge.covered + edge.partial + edge.missing;
  if (seen === 0) return 'untested';
  if (edge.covered / edge.links >= 0.7) return 'holds';
  if (edge.missing > edge.covered) return 'weak';
  return 'mixed';
}

const STROKE: Record<Relation['status'], { stroke: string; dash?: string }> = {
  holds: { stroke: 'var(--state-mastered)' },
  weak: { stroke: 'var(--state-due)' },
  mixed: { stroke: 'var(--ink-dim)' },
  untested: { stroke: 'var(--border-strong)', dash: '3 4' },
};

const STATUS_WORD: Record<Relation['status'], string> = {
  holds: 'holds',
  weak: 'keeps going missing',
  mixed: 'partly covered',
  untested: 'not drilled yet',
};

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * The concept map (deferred F6): cards as nodes, the links the deck's drills
 * ask for as edges. Desktop gets the SVG; below `md` the same data renders as
 * a list, where a 1000-unit graph would be unreadable. Every node is a real
 * link — Tab walks them alphabetically, and each one's accessible name reads
 * out its relations, so the picture is never the only way in (WCAG 1.1.1).
 */
export function ConceptMap({ deckId, nodes, edges, width, height }: ConceptMapProps) {
  const router = useRouter();
  const [active, setActive] = useState<string | null>(null);

  const byId = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const relations = useMemo(() => {
    const map = new Map<string, Relation[]>();
    for (const edge of edges) {
      const status = relationStatus(edge);
      const source = byId.get(edge.source);
      const target = byId.get(edge.target);
      if (!source || !target) continue;
      map.set(source.id, [...(map.get(source.id) ?? []), { id: target.id, term: target.term, status }]);
      map.set(target.id, [...(map.get(target.id) ?? []), { id: source.id, term: source.term, status }]);
    }
    return map;
  }, [byId, edges]);
  const ordered = useMemo(() => [...nodes].sort((a, b) => a.term.localeCompare(b.term)), [nodes]);
  const lit = active ? new Set((relations.get(active) ?? []).map((relation) => relation.id)) : null;

  const describe = (node: PositionedNode) => {
    const own = relations.get(node.id) ?? [];
    const parts = own.map((relation) => `${relation.term}, ${STATUS_WORD[relation.status]}`);
    const contradicted = node.contradicted > 0 ? ` Contradicted ${node.contradicted} times in 30 days.` : '';
    return `${node.term}. ${own.length} ${own.length === 1 ? 'relation' : 'relations'}: ${parts.join('; ')}.${contradicted} Opens a review of this card.`;
  };

  const open = (id: string) => router.push(`/dashboard/${deckId}/study?cards=${id}`);

  return (
    <div className="mt-3">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="hidden h-auto w-full md:block"
        role="group"
        aria-label={`Concept map: ${nodes.length} concepts, ${edges.length} relations`}
      >
        <g aria-hidden="true">
          {edges.map((edge) => {
            const a = byId.get(edge.source);
            const b = byId.get(edge.target);
            if (!a || !b) return null;
            const tone = STROKE[relationStatus(edge)];
            const dimmed = lit !== null && edge.source !== active && edge.target !== active;
            return (
              <line
                key={`${edge.source}-${edge.target}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={tone.stroke}
                strokeDasharray={tone.dash}
                strokeWidth={edge.links >= 3 ? 2 : edge.links === 2 ? 1.5 : 1}
                opacity={dimmed ? 0.15 : 0.9}
              />
            );
          })}
        </g>
        {ordered.map((node) => {
          const dimmed = lit !== null && node.id !== active && !lit.has(node.id);
          return (
            <a
              key={node.id}
              href={`/dashboard/${deckId}/study?cards=${node.id}`}
              aria-label={describe(node)}
              onClick={(event) => {
                event.preventDefault();
                open(node.id);
              }}
              onFocus={() => setActive(node.id)}
              onBlur={() => setActive(null)}
              onMouseEnter={() => setActive(node.id)}
              onMouseLeave={() => setActive(null)}
              className="concept-node outline-hidden"
              style={{ opacity: dimmed ? 0.35 : 1 }}
            >
              <title>{node.term}</title>
              <circle
                cx={node.x}
                cy={node.y}
                r={Math.min(9, 4 + node.degree)}
                fill="var(--surface)"
                stroke={node.contradicted > 0 ? 'var(--state-lapsed)' : 'var(--ink-dim)'}
                strokeWidth={node.id === active ? 2 : 1}
              />
              <text x={node.x + 12} y={node.y + 4} className="fill-[var(--ink)] text-[14px]">
                {truncate(node.term, 24)}
              </text>
            </a>
          );
        })}
      </svg>

      {/* Below md: the same relations as a list. */}
      <ul className="flex flex-col md:hidden">
        {ordered.map((node) => {
          const own = relations.get(node.id) ?? [];
          return (
            <li key={node.id} className="border-b border-border py-2.5 last:border-b-0">
              <button
                type="button"
                onClick={() => open(node.id)}
                className="min-h-[44px] text-left text-sm text-ink underline-offset-[3px] outline-hidden hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                {node.term}
              </button>
              <p className="mt-0.5 text-[13px] text-ink-dim">
                {own.map((relation) => `${relation.term} · ${STATUS_WORD[relation.status]}`).join('  —  ')}
              </p>
            </li>
          );
        })}
      </ul>

      {/* Every swatch ships with its word (design system §2.2b). */}
      <p className={`${LABEL} mt-2 flex flex-wrap gap-x-4 gap-y-1`}>
        {(Object.keys(STROKE) as Relation['status'][]).map((status) => (
          <span key={status} className="inline-flex items-center gap-1.5">
            <svg width="14" height="4" aria-hidden="true">
              <line x1="0" y1="2" x2="14" y2="2" stroke={STROKE[status].stroke} strokeDasharray={STROKE[status].dash} strokeWidth="2" />
            </svg>
            {STATUS_WORD[status]}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full border border-[var(--state-lapsed)]" aria-hidden="true" />
          contradicted in 30 days
        </span>
      </p>
    </div>
  );
}
