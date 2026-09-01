import { AlertTriangle, Target } from 'lucide-react';
import { getWeakestConcepts, type WeakestConcept } from '@/app/actions';
import { Card, CardContent } from '@/components/ui/card';

type WeakestConceptsProps = {
  deckId: string;
};

function getSeverityClass(errorRate: number) {
  if (errorRate >= 0.6) return { bar: 'bg-red-400', text: 'text-red-400', chip: 'bg-red-500/15 text-red-400' };
  if (errorRate >= 0.35) return { bar: 'bg-amber-400', text: 'text-amber-400', chip: 'bg-amber-500/15 text-amber-400' };
  return { bar: 'bg-yellow-400', text: 'text-yellow-400', chip: 'bg-yellow-500/15 text-yellow-400' };
}

function ConceptRow({ concept }: { concept: WeakestConcept }) {
  const percentage = Math.round(concept.error_rate * 100);
  const severity = getSeverityClass(concept.error_rate);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-sm font-medium text-foreground">{concept.topic_tag}</span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${severity.chip}`}>
          {percentage}% missed
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-primary/10">
        <div className={`h-full rounded-full ${severity.bar}`} style={{ width: `${percentage}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">
        {concept.misses} of {concept.attempts} attempts missed
      </p>
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
    <Card className="glass-card border-primary/20 mt-8">
      <CardContent className="space-y-5 p-6">
        <h3 className="flex items-center gap-2 text-xl font-bold tracking-tight">
          <AlertTriangle className="h-5 w-5 text-amber-400" /> Weakest Concepts
        </h3>
        <p className="-mt-3 text-sm text-muted-foreground">
          Topics with the highest quiz miss rate across your attempts on this deck.
        </p>
        <div className="space-y-4">
          {concepts.map((concept) => (
            <ConceptRow key={concept.topic_tag} concept={concept} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function WeakestConceptsSkeleton() {
  return (
    <Card className="glass-card border-primary/20 mt-8 animate-pulse">
      <CardContent className="space-y-4 p-6">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-primary/40" />
          <div className="h-5 w-40 rounded bg-primary/10" />
        </div>
        <div className="h-10 rounded-xl bg-primary/5" />
        <div className="h-10 rounded-xl bg-primary/5" />
      </CardContent>
    </Card>
  );
}
