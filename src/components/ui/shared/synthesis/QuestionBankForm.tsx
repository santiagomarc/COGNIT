'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { deleteQuestion, ingestQuestions } from '@/app/actions/synthesis';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { GeneratePlanQuestionButton } from '@/components/ui/shared/synthesis/GenerateSynthesisDrillsButton';
import { formatActionError } from '@/lib/ai-feedback';

const LABEL = 'font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer';

/** Paste past-paper questions, one per line (plan D16). */
export function QuestionBankForm({ deckId }: { deckId: string }) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [isPending, startTransition] = useTransition();
  const lines = text.split('\n').map((line) => line.trim()).filter((line) => line.length >= 10);

  const submit = () => {
    if (lines.length === 0) return;
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof ingestQuestions>>;
      try {
        result = await ingestQuestions({ deck_id: deckId, questions: lines.slice(0, 20) });
      } catch {
        toast.error('The import did not come back. Check your connection and try again.');
        return;
      }
      if (!result || !('success' in result) || !result.success) {
        toast.error(formatActionError('error' in result ? result.error : null, 'Could not import the questions.'));
        return;
      }
      const mapped = result.questions.filter((question) => question.mappedCards > 0).length;
      toast.success(result.unmapped
        ? `${result.questions.length} saved — sync embeddings to map them to cards.`
        : `${result.questions.length} saved · ${mapped} matched to cards`);
      setText('');
      router.refresh();
    });
  };

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <label className="flex flex-col gap-1">
        <span className={LABEL}>Past-paper questions · one per line</span>
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={'To what extent does the time quantum determine responsiveness?\nDiscuss the causes of thrashing.'}
          rows={3}
          maxLength={12_000}
          disabled={isPending}
          className="text-[13px]"
        />
      </label>
      <div className="flex items-center justify-between gap-3">
        <span className={`${LABEL} tnum`}>{lines.length} {lines.length === 1 ? 'question' : 'questions'}{lines.length > 20 ? ' · first 20' : ''}</span>
        <Button type="submit" size="sm" disabled={isPending || lines.length === 0}>
          {isPending ? 'Matching to cards…' : 'Import'}
        </Button>
      </div>
    </form>
  );
}

type QuestionRowActionsProps = {
  deckId: string;
  questionId: string;
  drillId: string | null;
};

/** Per question: plan it (one generation), open the plan once it exists, or remove it. */
export function QuestionRowActions({ deckId, questionId, drillId }: QuestionRowActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const remove = () => {
    startTransition(async () => {
      try {
        const result = await deleteQuestion({ deck_id: deckId, question_id: questionId });
        if (result && 'error' in result && result.error) {
          toast.error(formatActionError(result.error, 'Could not remove the question.'));
          return;
        }
        router.refresh();
      } catch {
        toast.error('Could not remove the question. Check your connection and try again.');
      }
    });
  };

  return (
    <span className="flex shrink-0 items-center gap-1">
      {drillId ? (
        <Button asChild variant="default" size="sm" className="h-[26px] px-2 text-[12px]">
          <Link href={`/dashboard/${deckId}/synthesis?kind=plan&drill=${drillId}&count=1`}>Plan it</Link>
        </Button>
      ) : (
        <GeneratePlanQuestionButton deckId={deckId} questionId={questionId} label="Make a plan" className="h-[26px] px-2 text-[12px]" />
      )}
      <Button type="button" variant="ghost" size="sm" onClick={remove} disabled={isPending} aria-label="Remove question" className="h-[26px] px-2 text-[12px]">
        Remove
      </Button>
    </span>
  );
}
