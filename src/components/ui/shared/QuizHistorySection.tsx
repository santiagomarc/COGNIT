import { Target } from 'lucide-react';
import { getQuizHistory } from '@/app/actions/quiz';
import { QuizHistoryList } from '@/components/ui/shared/QuizHistoryList';
import { Card, CardContent } from '@/components/ui/card';

type QuizHistorySectionProps = {
  deckId: string;
};

export async function QuizHistorySection({ deckId }: QuizHistorySectionProps) {
  const historyResult = await getQuizHistory(deckId);

  if (historyResult && 'error' in historyResult) {
    return (
      <Card className="glass-card border-primary/20 mt-8">
        <CardContent className="flex flex-col items-center justify-center p-8 text-muted-foreground">
          <Target className="w-12 h-12 mb-4 opacity-50" />
          <p>Quiz history is taking longer than expected. Please refresh in a moment.</p>
        </CardContent>
      </Card>
    );
  }

  const history = (historyResult && 'history' in historyResult ? historyResult.history : []) ?? [];
  return <QuizHistoryList history={history} deckId={deckId} />;
}

export function QuizHistorySkeleton() {
  return (
    <Card className="glass-card border-primary/20 mt-8 animate-pulse">
      <CardContent className="space-y-4 p-6">
        <div className="h-5 w-48 rounded bg-primary/10" />
        <div className="h-16 rounded-xl bg-primary/5" />
        <div className="h-16 rounded-xl bg-primary/5" />
      </CardContent>
    </Card>
  );
}
