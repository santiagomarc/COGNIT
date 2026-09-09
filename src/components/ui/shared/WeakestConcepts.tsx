import { getWeakestConcepts, type WeakestConcept } from '@/app/actions/quiz';

type WeakestConceptsProps = {
  deckId: string;
};

/**
 * A miss rate is not an SM-2 state, so it does not get its own three-step
 * colour ramp — the red/amber/yellow scale this replaces invented two
 * thresholds the scheduler has never heard of (§2.2).
 *
 * The one hue permitted here is `--state-lapsed`, and only past the point where
 * a topic is genuinely failing rather than merely imperfect.
 */
const FAILING_THRESHOLD = 0.5;

function ConceptRow({ concept }: { concept: WeakestConcept }) {
  const percentage = Math.round(concept.error_rate * 100);
  const failing = concept.error_rate >= FAILING_THRESHOLD;

  return (
    <div className="flex items-center gap-4 border-b border-border py-2.5 last:border-b-0">
      <span className="min-w-0 flex-1 truncate text-sm text-ink">{concept.topic_tag}</span>

      <span aria-hidden="true" className="hidden h-[3px] w-[104px] shrink-0 bg-border sm:block">
        <span
          className="block h-full"
          style={{
            width: `${percentage}%`,
            backgroundColor: failing ? 'var(--state-lapsed)' : 'var(--ink-dim)',
          }}
        />
      </span>

      {/* The colour is never alone: the percentage and the raw attempts say
          the same thing in words and numbers (WCAG 1.4.1). */}
      <span
        className="w-16 shrink-0 text-right font-mono text-[13px] tnum"
        style={{ color: failing ? 'var(--state-lapsed)' : 'var(--ink-dim)' }}
      >
        {percentage}%
      </span>

      <span className="hidden w-24 shrink-0 text-right font-mono text-[13px] tnum text-ink-dimmer md:block">
        {concept.misses}/{concept.attempts}
      </span>
    </div>
  );
}

export async function WeakestConcepts({ deckId }: WeakestConceptsProps) {
  const result = await getWeakestConcepts(deckId);

  if (result && 'error' in result) {
    return null;
  }

  const concepts = result && 'concepts' in result ? result.concepts : [];
  if (concepts.length === 0) {
    return null;
  }

  return (
    <section className="surface p-5 md:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
          Weakest concepts
        </h2>
        <p className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
          Missed / attempts
        </p>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Topics with the highest quiz miss rate across your attempts on this deck.
      </p>

      <div className="mt-4 border-t border-border">
        {concepts.map((concept) => (
          <ConceptRow key={concept.topic_tag} concept={concept} />
        ))}
      </div>
    </section>
  );
}

export function WeakestConceptsSkeleton() {
  return (
    <section className="surface p-5 md:p-6">
      <div className="glass-skeleton h-3 w-36 rounded-sm" />
      <div className="mt-4 space-y-3 border-t border-border pt-4">
        <div className="glass-skeleton h-4 w-full rounded-sm" />
        <div className="glass-skeleton h-4 w-full rounded-sm" />
      </div>
    </section>
  );
}
