'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CircleAlert, CircleCheckBig } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { StudyGrade } from '@/lib/sm2';

type MCQModeCard = {
  id: string;
  front: string;
  id_question: string | null;
  back: string;
  mcq_distractors: string[] | null;
};

type MCQModeProps = {
  card: MCQModeCard;
  disabled: boolean;
  enrichmentPending: boolean;
  onResolve: (grade: StudyGrade, wasCorrect: boolean, answer: string) => void;
  onFallbackToIdentification: () => void;
  /** Fires the moment an option is chosen, so audio/haptics feel immediate. */
  onAnswered?: (wasCorrect: boolean) => void;
};

function shuffle<T>(items: T[]) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[randomIndex]] = [next[randomIndex], next[index]];
  }
  return next;
}

export function MCQMode({
  card,
  disabled,
  enrichmentPending,
  onResolve,
  onFallbackToIdentification,
  onAnswered,
}: MCQModeProps) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false);

  const options = useMemo(() => {
    // Defence in depth: the server already rejects duplicate distractors
    // (selectUsableDistractors), but a duplicate reaching the client renders
    // two options as "correct" and triggers a duplicate React key.
    const seen = new Set<string>([card.front.trim().toLowerCase()]);
    const distractors = (Array.isArray(card.mcq_distractors) ? card.mcq_distractors : [])
      .filter((value) => {
        const key = value?.trim().toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    // The old trailing .slice(0, Math.max(2, distractors.length + 1)) was a
    // no-op by construction; dropped.
    return shuffle([card.front, ...distractors]);
  }, [card.front, card.mcq_distractors]);

  const prompt = card.id_question ?? card.back;
  const wasCorrect = selectedOption === card.front;

  const handleContinue = useCallback(() => {
    if (disabled || !resolved || !selectedOption) {
      return;
    }

    onResolve(wasCorrect ? 'easy' : 'again', wasCorrect, selectedOption);
  }, [disabled, onResolve, resolved, selectedOption, wasCorrect]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (disabled || resolved) {
        return;
      }

      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const optionIndex = Number(event.key) - 1;
      if (optionIndex < 0 || optionIndex >= options.length) {
        return;
      }

      event.preventDefault();
      const option = options[optionIndex];
      setSelectedOption(option);
      setResolved(true);
      onAnswered?.(option === card.front);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [card.front, disabled, onAnswered, options, resolved]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!resolved || disabled || !selectedOption) {
        return;
      }

      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (event.key !== ' ' || event.repeat) {
        return;
      }

      event.preventDefault();
      handleContinue();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [disabled, handleContinue, resolved, selectedOption]);

  if (options.length < 4) {
    return (
      <div className="glass-card glow-border rounded-3xl p-7">
        <div className="rounded-2xl border border-primary/10 bg-card/20 p-5 text-center">
          <p className="text-lg font-semibold">Preparing quiz data</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {enrichmentPending
              ? 'AI is generating plausible distractors for this card.'
              : 'This card does not have enough distractors yet.'}
          </p>
          <div className="mt-4 flex justify-center gap-3">
            <Button type="button" variant="outline" onClick={onFallbackToIdentification}>
              Switch to Identification
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card glow-border rounded-3xl p-7">
      <div className="mb-4 flex items-center justify-between gap-3 text-xs uppercase tracking-wider text-muted-foreground">
        <span>Multiple Choice</span>
        <span className="rounded-full border border-primary/15 bg-card/40 px-2 py-0.5 text-[10px] font-semibold">
          {options.length} options
        </span>
      </div>

      <div className="space-y-4">
        <div className="rounded-2xl border border-primary/15 bg-background/25 px-6 py-6 text-center text-lg leading-relaxed">
          {prompt}
        </div>

        <div className="grid gap-3">
          {options.map((option, index) => {
            const isCorrect = option === card.front;
            const isSelected = option === selectedOption;
            const feedbackClass = resolved
              ? isCorrect
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200'
                : isSelected
                  ? 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-200'
                  : 'border-primary/10 bg-card/20 text-muted-foreground'
              : 'border-primary/10 bg-card/20 text-foreground hover:border-primary/25 hover:bg-card/40';

            return (
              <button
                key={`${card.id}-${index}`}
                type="button"
                onClick={() => {
                  if (resolved || disabled) {
                    return;
                  }
                  setSelectedOption(option);
                  setResolved(true);
                  onAnswered?.(option === card.front);
                }}
                disabled={disabled || resolved}
                className={`rounded-2xl border px-4 py-4 text-left transition-colors ${feedbackClass}`}
              >
                <span className="mr-3 inline-flex h-6 w-6 items-center justify-center rounded-full border border-current/20 text-xs font-semibold">
                  {index + 1}
                </span>
                {option}
              </button>
            );
          })}
        </div>

        {resolved ? (
          <div className="space-y-4 rounded-2xl border border-primary/10 bg-card/20 p-4">
            <div className="flex items-start gap-3 text-sm">
              {wasCorrect ? (
                <CircleCheckBig className="mt-0.5 h-5 w-5 text-emerald-400" />
              ) : (
                <CircleAlert className="mt-0.5 h-5 w-5 text-red-400" />
              )}
              <div className="space-y-1">
                <p className="font-medium text-foreground">
                  {wasCorrect ? 'Correct choice.' : 'Incorrect choice.'}
                </p>
                {!wasCorrect ? (
                  <p className="text-muted-foreground">Correct answer: {card.front}</p>
                ) : null}
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={handleContinue}
                disabled={disabled}
              >
                Continue
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-4 text-center text-xs text-muted-foreground/70">
        Press <span className="font-mono">1-{options.length}</span> to choose an option.
      </div>
    </div>
  );
}