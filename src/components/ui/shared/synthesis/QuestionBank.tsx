import { getRequestClient, getSessionUser } from '@/lib/supabase/session';
import { loadQuestionBank } from '@/lib/synthesis/loaders';
import { QuestionBankForm, QuestionRowActions } from '@/components/ui/shared/synthesis/QuestionBankForm';

const LABEL = 'font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer';

/**
 * The question bank (plan D16): past-paper questions in, coverage out. Each
 * row shows how many cards the question reached and, once a plan was made
 * from it, which concepts the deck lacks for it — the to-do list for the
 * week before the exam.
 */
export async function QuestionBank({ deckId }: { deckId: string }) {
  const [supabase, user] = await Promise.all([getRequestClient(), getSessionUser()]);
  if (!user) return null;
  const questions = await loadQuestionBank(supabase, { deckId, userId: user.id });

  return (
    <section className="surface p-5 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className={LABEL}>Exam questions</h2>
        <p className={`${LABEL} tnum`}>{questions.length} saved</p>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Paste questions from past papers. Each is matched to your cards; a plan made from it tells you what the deck still lacks.
      </p>

      <div className="mt-4">
        <QuestionBankForm deckId={deckId} />
      </div>

      {questions.length > 0 ? (
        <ul className="mt-4 border-t border-border">
          {questions.map((question) => (
            <li key={question.id} className="flex flex-col gap-1.5 border-b border-border py-3 last:border-b-0 sm:flex-row sm:items-start sm:gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-ink">{question.text}</p>
                <p className={`${LABEL} mt-1 tnum`}>
                  {question.mappedCards} {question.mappedCards === 1 ? 'card' : 'cards'} matched
                  {question.drillId ? ' · plan ready' : ''}
                </p>
                {question.missingConcepts.length > 0 ? (
                  <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className={LABEL}>Deck lacks</span>
                    {question.missingConcepts.map((concept) => (
                      <span key={concept} className="term-chip cursor-default" style={{ color: 'var(--state-due)' }}>{concept}</span>
                    ))}
                  </p>
                ) : null}
              </div>
              <QuestionRowActions deckId={deckId} questionId={question.id} drillId={question.drillId} />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function QuestionBankSkeleton() {
  return (
    <section className="surface p-5 md:p-6">
      <div className="glass-skeleton h-3 w-32 rounded-sm" />
      <div className="mt-4 glass-skeleton h-[72px] w-full rounded-[var(--radius-md)]" />
    </section>
  );
}
