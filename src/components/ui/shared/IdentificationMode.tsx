'use client';

import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CircleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { HintButton } from '@/components/ui/shared/HintButton';
import { similarity } from '@/lib/fuzzy';
import type { StudyGrade } from '@/lib/sm2';

type IdentificationModeCard = {
  id: string;
  front: string;
  back: string;
  id_question: string | null;
};

type IdentificationModeProps = {
  deckId: string;
  card: IdentificationModeCard;
  disabled: boolean;
  enrichmentPending: boolean;
  onResolve: (grade: StudyGrade, score: number, answer: string) => void;
  /** Fires the moment the answer is checked, so audio/haptics feel immediate. */
  onAnswered?: (wasCorrect: boolean) => void;
};

type IdentificationResult = {
  answer: string;
  score: number;
  grade: StudyGrade;
};

function getGrade(score: number): StudyGrade {
  if (score >= 0.85) {
    return 'good';
  }
  if (score >= 0.7) {
    return 'hard';
  }
  return 'again';
}

export function IdentificationMode({
  deckId,
  card,
  disabled,
  enrichmentPending,
  onResolve,
  onAnswered,
}: IdentificationModeProps) {
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState<IdentificationResult | null>(null);

  const prompt = useMemo(() => card.id_question ?? card.back, [card.back, card.id_question]);
  const promptStatusLabel = card.id_question ? 'AI-Rewritten Prompt' : 'Source Description';
  const promptStatusText = card.id_question
    ? 'This clue was rewritten from the card description to make the identification prompt cleaner.'
    : 'This clue is using the saved card description directly until a rewritten prompt is available.';

  // MCQ advances on Space after feedback; Identification had no equivalent, and
  // the shortcut panel admitted as much ("use keyboard focus + Enter").
  useEffect(() => {
    if (!result || disabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement
        || event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if ((event.key !== 'Enter' && event.key !== ' ') || event.repeat) return;

      event.preventDefault();
      onResolve(result.grade, result.score, result.answer);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [disabled, onResolve, result]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!answer.trim() || disabled) {
      return;
    }

    const score = similarity(answer, card.front);
    setResult({
      answer,
      score,
      grade: getGrade(score),
    });
    // 0.7 is the same threshold the server uses when it re-grades the attempt.
    onAnswered?.(score >= 0.7);
  }

  return (
    <div className="glass-card rounded-3xl p-7">
      <div className="mb-4 flex items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dimmer">
        <span>Identification Prompt</span>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${card.id_question ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300'}`}>
          {promptStatusLabel}
        </span>
      </div>

      <p className="mb-4 text-sm text-muted-foreground">
        {promptStatusText}
      </p>

      <div className="space-y-4">
        <div className="rounded-2xl border border-border bg-background/25 px-6 py-6 text-center text-lg leading-relaxed">
          {prompt}
        </div>

        {enrichmentPending && !card.id_question ? (
          <div className="rounded-xl border border-border bg-card/20 px-4 py-3 text-sm text-muted-foreground">
            AI is preparing a cleaner question-style clue for this card. You can still answer using the saved description right now.
          </div>
        ) : null}

        {result ? (
          <div className="space-y-4 rounded-2xl border border-border bg-card/20 p-4">
            <div className="flex items-start gap-3">
              {result.grade === 'again' ? (
                <CircleAlert className="mt-0.5 h-5 w-5 text-red-400" />
              ) : (
                <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-400" />
              )}
              <div className="space-y-1 text-sm">
                <p>
                  <span className="font-semibold text-foreground">Your answer:</span> {result.answer}
                </p>
                <p>
                  <span className="font-semibold text-foreground">Correct term:</span> {card.front}
                </p>
                <p className="text-muted-foreground">
                  Similarity score: <span className="font-mono tnum">{Math.round(result.score * 100)}%</span>
                </p>
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="button" onClick={() => onResolve(result.grade, result.score, result.answer)} disabled={disabled}>
                Continue
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor={`id-answer-${card.id}`} className="text-sm font-medium">
                Type the term
              </label>
              <Input
                id={`id-answer-${card.id}`}
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                placeholder="Enter the matching term"
                disabled={disabled}
                autoFocus
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <HintButton cardId={card.id} deckId={deckId} disabled={disabled} />
              <Button type="submit" disabled={disabled || !answer.trim()}>
                Check Answer
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}