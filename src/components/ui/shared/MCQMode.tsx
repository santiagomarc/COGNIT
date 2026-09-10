'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { CornerBrackets } from '@/components/ui/CornerBrackets';
import { Kbd } from '@/components/ui/Kbd';
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
      <div className="flex flex-1 items-center justify-center p-4 md:p-8">
        <div className="surface mx-auto w-full max-w-xl p-7 text-center">
          <p className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
            Multiple choice
          </p>
          <p className="mt-3 text-base font-semibold">Preparing quiz data</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {enrichmentPending
              ? 'AI is generating plausible distractors for this card.'
              : 'This card does not have enough distractors yet.'}
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <Button type="button" onClick={onFallbackToIdentification}>
              Switch to identification
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      {/* Centered stage */}
      <main className="flex flex-1 items-center justify-center p-4 md:p-8">
        <div className="mx-auto w-full max-w-2xl space-y-6">
          {/* Eyebrow */}
          <div className="flex items-center justify-between font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
            <span>Multiple choice</span>
            <span className="tnum">{options.length} options</span>
          </div>

          {/* Question prompt in corner brackets on flat ground (§4 Task 4.1) */}
          <div className="relative flex min-h-[9rem] items-center justify-center px-6 py-8 text-center sm:px-10">
            <CornerBrackets />
            <p className="mx-auto max-w-[34ch] text-balance font-serif text-[clamp(2.1rem,3.3vw,2.85rem)] leading-[1.25] tracking-[-0.02em] text-ink">
              {prompt}
            </p>
          </div>

          {/* Options grid (§4 Task 4.2) */}
          <div className="grid gap-2.5">
            {options.map((option, index) => {
              const isCorrect = option === card.front;
              const isSelected = option === selectedOption;
              const result = !resolved
                ? undefined
                : isCorrect
                  ? 'correct'
                  : isSelected
                    ? 'wrong'
                    : 'muted';

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
                  data-result={result}
                  className="opt"
                >
                  <Kbd className="mt-[3px] shrink-0">{index + 1}</Kbd>
                  <span className="flex-1 text-[14px] leading-[1.5]">{option}</span>
                  {result === 'correct' ? (
                    <span className="mt-[3px] shrink-0 font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-[var(--state-mastered)]">
                      Correct
                    </span>
                  ) : null}
                  {result === 'wrong' ? (
                    <span className="mt-[3px] shrink-0 font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-[var(--state-lapsed)]">
                      Your answer
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </main>

      {/* Action band pinned to bottom (§4 Task 4.3) */}
      <footer className="grade-band">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            {resolved ? (
              <p className="text-sm">
                {wasCorrect ? (
                  <span className="font-medium text-[var(--state-mastered)]">Correct.</span>
                ) : (
                  <span>
                    <span className="font-medium text-[var(--state-lapsed)]">Incorrect.</span>{' '}
                    <span className="text-muted-foreground">The answer is marked above.</span>
                  </span>
                )}
              </p>
            ) : (
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dimmer">
                Select an option 1–{options.length}
              </p>
            )}
          </div>

          <Button
            type="button"
            variant="primary"
            onClick={handleContinue}
            disabled={disabled || !resolved}
            className={`gap-2 transition-opacity ${!resolved ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
          >
            Continue
            <Kbd>Space</Kbd>
          </Button>
        </div>
      </footer>
    </div>
  );
}
