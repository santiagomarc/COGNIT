'use client';

import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { CornerBrackets } from '@/components/ui/CornerBrackets';
import { Kbd } from '@/components/ui/Kbd';
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

  function handleSubmit(event?: FormEvent) {
    if (event) {
      event.preventDefault();
    }
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
    <div className="flex flex-1 flex-col">
      {/* Centered stage */}
      <main className="flex flex-1 items-center justify-center p-4 md:p-8">
        <div className="mx-auto w-full max-w-2xl space-y-6">
          {/* Eyebrow */}
          <div className="flex items-center justify-between font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
            <span>Identification</span>
            <span>{promptStatusLabel}</span>
          </div>

          {/* Question prompt in corner brackets on flat ground (§4 Task 4.1) */}
          <div className="relative flex min-h-[9rem] items-center justify-center px-6 py-8 text-center sm:px-10">
            <CornerBrackets />
            <p className="mx-auto max-w-[34ch] text-balance font-serif text-[clamp(2.1rem,3.3vw,2.85rem)] font-medium leading-[1.25] tracking-[-0.02em] text-ink">
              {prompt}
            </p>
          </div>

          {enrichmentPending && !card.id_question ? (
            <p className="border-l-2 border-border-strong pl-3 text-xs text-muted-foreground">
              AI is preparing a cleaner question-style clue for this card. You can still answer using
              the saved description right now.
            </p>
          ) : null}

          {result ? (
            <div className="surface p-5 space-y-3">
              <dl className="space-y-2 text-sm">
                <div className="flex gap-3">
                  <dt className="shrink-0 font-mono text-[10px] uppercase leading-[1.9] tracking-[0.16em] text-ink-dimmer">
                    You
                  </dt>
                  <dd
                    className={
                      result.grade === 'again'
                        ? 'font-medium text-[var(--state-lapsed)]'
                        : 'font-medium text-[var(--state-mastered)]'
                    }
                  >
                    {result.answer}
                  </dd>
                </div>
                <div className="flex gap-3">
                  <dt className="shrink-0 font-mono text-[10px] uppercase leading-[1.9] tracking-[0.16em] text-ink-dimmer">
                    Term
                  </dt>
                  <dd className="font-medium text-ink">{card.front}</dd>
                </div>
                <div className="flex gap-3">
                  <dt className="shrink-0 font-mono text-[10px] uppercase leading-[1.9] tracking-[0.16em] text-ink-dimmer">
                    Match
                  </dt>
                  <dd className="font-mono tnum text-ink-dim">{Math.round(result.score * 100)}%</dd>
                </div>
              </dl>
            </div>
          ) : (
            <form id={`id-form-${card.id}`} onSubmit={handleSubmit} className="space-y-2">
              <label
                htmlFor={`id-answer-${card.id}`}
                className="block font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer"
              >
                Type the matching term
              </label>
              <Input
                id={`id-answer-${card.id}`}
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                placeholder="Enter the matching term"
                disabled={disabled}
                autoFocus
              />
            </form>
          )}
        </div>
      </main>

      {/* Action band pinned to bottom (§4 Task 4.3) */}
      <footer className="grade-band">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            {!result ? (
              <HintButton cardId={card.id} deckId={deckId} disabled={disabled} />
            ) : (
              <p className="text-sm">
                {result.grade === 'again' ? (
                  <span>
                    <span className="font-medium text-[var(--state-lapsed)]">Missed.</span>{' '}
                    <span className="text-muted-foreground">{Math.round(result.score * 100)}% match</span>
                  </span>
                ) : (
                  <span>
                    <span className="font-medium text-[var(--state-mastered)]">Correct.</span>{' '}
                    <span className="text-muted-foreground">{Math.round(result.score * 100)}% match</span>
                  </span>
                )}
              </p>
            )}
          </div>

          {!result ? (
            <Button
              type="submit"
              form={`id-form-${card.id}`}
              variant="primary"
              disabled={disabled || !answer.trim()}
              className="gap-2"
            >
              Check answer
              <Kbd>Enter</Kbd>
            </Button>
          ) : (
            <Button
              type="button"
              variant="primary"
              onClick={() => onResolve(result.grade, result.score, result.answer)}
              disabled={disabled}
              className="gap-2"
            >
              Continue
              <Kbd>Enter</Kbd>
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}
