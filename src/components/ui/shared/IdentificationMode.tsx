'use client';

import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
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
    <div className="surface p-6 sm:p-7">
      <div className="mb-5 flex items-center justify-between gap-3 font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
        <span>Identification</span>
        <span>{promptStatusLabel}</span>
      </div>

      <div className="space-y-5">
        {/* The card prompt — the serif's one sanctioned role (§3.2). */}
        <p className="mx-auto max-w-[36ch] text-balance text-center font-serif text-[clamp(1.25rem,2vw,1.625rem)] leading-[1.32] tracking-[-0.01em]">
          {prompt}
        </p>

        <p className="text-sm text-muted-foreground">{promptStatusText}</p>

        {enrichmentPending && !card.id_question ? (
          <p className="border-l-2 border-border-strong pl-3 text-sm text-muted-foreground">
            AI is preparing a cleaner question-style clue for this card. You can still answer using
            the saved description right now.
          </p>
        ) : null}

        {result ? (
          /* Inline at the point of the error, never a modal, and it never takes
             the keyboard: Enter and Space both still advance (§5.5). */
          <div className="space-y-4 border-t border-border pt-4">
            <dl className="space-y-1.5 text-sm">
              <div className="flex gap-2">
                <dt className="shrink-0 font-mono text-[10px] uppercase leading-[1.9] tracking-[0.16em] text-ink-dimmer">
                  You
                </dt>
                <dd
                  className={
                    result.grade === 'again'
                      ? 'text-[var(--state-lapsed)]'
                      : 'text-[var(--state-mastered)]'
                  }
                >
                  {result.answer}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="shrink-0 font-mono text-[10px] uppercase leading-[1.9] tracking-[0.16em] text-ink-dimmer">
                  Term
                </dt>
                <dd className="text-ink">{card.front}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="shrink-0 font-mono text-[10px] uppercase leading-[1.9] tracking-[0.16em] text-ink-dimmer">
                  Match
                </dt>
                <dd className="font-mono tnum text-ink-dim">{Math.round(result.score * 100)}%</dd>
              </div>
            </dl>
            <div className="flex justify-end">
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
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label
                htmlFor={`id-answer-${card.id}`}
                className="block font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer"
              >
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
              {/* The binding sits on the control it triggers, at every
                  breakpoint (§7.3). */}
              <Button
                type="submit"
                variant="primary"
                disabled={disabled || !answer.trim()}
                className="gap-2"
              >
                Check answer
                <Kbd>Enter</Kbd>
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
