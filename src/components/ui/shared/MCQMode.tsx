'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
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
      <div className="surface p-7 text-center">
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
    );
  }

  return (
    <div className="surface p-6 sm:p-7">
      <div className="mb-5 flex items-center justify-between gap-3 font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
        <span>Multiple choice</span>
        {/* A count is a better badge than a glyph (§6). */}
        <span className="tnum">{options.length} options</span>
      </div>

      <div className="space-y-5">
        {/* The question is the card prompt, so it is the serif's one sanctioned
            role (§3.2) — a step down from the study canvas, where the prompt is
            alone on screen. */}
        <p className="mx-auto max-w-[36ch] text-balance text-center font-serif text-[clamp(1.25rem,2vw,1.625rem)] leading-[1.32] tracking-[-0.01em]">
          {prompt}
        </p>

        <div className="grid gap-2">
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
                {/*
                  The binding is bound to the control it triggers (§7.3). It was
                  implemented all along and advertised only as a line of body
                  text under the options — a legend the user had to correlate
                  with a button is not a discovery aid. Never hidden
                  responsively: a phone with a keyboard is still a keyboard.
                */}
                <Kbd className="mt-[3px] shrink-0">{index + 1}</Kbd>
                <span className="flex-1 text-[14px] leading-[1.5]">{option}</span>
                {/*
                  Colour is never the only carrier of meaning (WCAG 1.4.1), so
                  each marked option also says which one it is in words.
                */}
                {result === 'correct' ? (
                  <span className="mt-[3px] shrink-0 font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em]">
                    Correct
                  </span>
                ) : null}
                {result === 'wrong' ? (
                  <span className="mt-[3px] shrink-0 font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em]">
                    Your answer
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {/*
          The result is inline at the point of the error rather than in a modal,
          and it never takes the keyboard: `Space` still advances while it is on
          screen (§5.5).
        */}
        {resolved ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <p className="text-sm text-muted-foreground">
              {wasCorrect ? (
                <span className="font-medium text-[var(--state-mastered)]">Correct.</span>
              ) : (
                <>
                  <span className="font-medium text-[var(--state-lapsed)]">Incorrect.</span>{' '}
                  The answer is marked above.
                </>
              )}
            </p>
            <Button
              type="button"
              variant="primary"
              onClick={handleContinue}
              disabled={disabled}
              className="gap-2"
            >
              Continue
              <Kbd>Space</Kbd>
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
