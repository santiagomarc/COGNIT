import { getQuizHistory } from '@/app/actions/quiz';
import { QuizHistoryList } from '@/components/ui/shared/QuizHistoryList';

type QuizHistorySectionProps = {
  deckId: string;
};

export async function QuizHistorySection({ deckId }: QuizHistorySectionProps) {
  const historyResult = await getQuizHistory(deckId);

  if (historyResult && 'error' in historyResult) {
    return (
      <section className="surface p-5 md:p-6">
        <h2 className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
          Quiz history
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Quiz history is taking longer than expected. Please refresh in a moment.
        </p>
      </section>
    );
  }

  const history = (historyResult && 'history' in historyResult ? historyResult.history : []) ?? [];
  return <QuizHistoryList history={history} deckId={deckId} />;
}

export function QuizHistorySkeleton() {
  return (
    <section className="surface p-5 md:p-6">
      <div className="glass-skeleton h-3 w-32 rounded-sm" />
      <div className="mt-4 space-y-3 border-t border-border pt-4">
        <div className="glass-skeleton h-12 w-full rounded-sm" />
        <div className="glass-skeleton h-12 w-full rounded-sm" />
      </div>
    </section>
  );
}
