import { ConceptMap } from '@/components/ui/shared/synthesis/ConceptMap';
import { layoutConceptGraph, parseConceptGraph } from '@/lib/concept-graph';
import { logger } from '@/lib/logger';
import { getRequestClient, getSessionUser } from '@/lib/supabase/session';

const WIDTH = 1000;
const HEIGHT = 520;
const MAX_NODES = 60;
const LABEL = 'font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer';

/**
 * The Insights segment's one `.raised` object (design system §7.1): the deck's
 * concepts and how the drills have tested the relations between them. Graph
 * read, parse and layout all happen here, on the server.
 */
export async function ConceptMapPanel({ deckId }: { deckId: string }) {
  const [supabase, user] = await Promise.all([getRequestClient(), getSessionUser()]);
  if (!user) return null;

  const { data, error } = await supabase.rpc('get_concept_graph', { p_deck_id: deckId, p_max_nodes: MAX_NODES });
  if (error) logger.warn('concept-map', 'get_concept_graph failed', { message: error.message });
  const graph = error ? null : parseConceptGraph(data);

  if (!graph || graph.edges.length === 0) {
    return (
      <section className="surface p-5 md:p-6" aria-labelledby="concept-map-heading">
        <h2 id="concept-map-heading" className={LABEL}>Concept map</h2>
        <p className="mt-2 max-w-xl text-sm text-ink-dim">
          The map draws itself from your drills: every link a drill asks for joins two concepts. Generate a few drills to see how this deck connects.
        </p>
      </section>
    );
  }

  const nodes = layoutConceptGraph(graph, { width: WIDTH, height: HEIGHT });

  return (
    <section className="raised spec relative p-4 md:p-5" aria-labelledby="concept-map-heading">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="concept-map-heading" className={LABEL}>Concept map</h2>
        <p className={`${LABEL} tnum`}>
          {graph.nodes.length} concepts · {graph.edges.length} relations
        </p>
      </div>
      <ConceptMap deckId={deckId} nodes={nodes} edges={graph.edges} width={WIDTH} height={HEIGHT} />
    </section>
  );
}
