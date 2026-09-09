import type { ReactNode } from 'react';

import { CornerBrackets } from '@/components/ui/CornerBrackets';
import type { StudyGrade } from '@/lib/sm2';
import { cn } from '@/lib/utils';

/**
 * The four states of the study card (design system §7.6). One attribute, not a
 * bag of conditional class strings — the CSS in `globals.css` owns every
 * transition and this component owns none of them.
 *
 * `focus` is normally reached through `:focus-visible` and does not need to be
 * passed; it exists so the state can also be driven explicitly.
 */
export type FlipState = 'default' | 'flipping' | 'graded' | 'focus';

type FlipCardProps = {
  /**
   * What the user is asked. **Never `front`/`back`** (defect F-07): in this
   * schema `card.front` is the answer and `card.back` is the question, so a
   * component API that repeated those names would invert every deck in the
   * product for whoever read it next. The mapping happens at the boundary:
   *
   * ```tsx
   * <FlipCard prompt={card.id_question ?? card.back} answer={card.front} />
   * ```
   */
  prompt: ReactNode;
  /** What the user is trying to recall. */
  answer: ReactNode;
  state: FlipState;
  /** Colours the 160ms commit flash. Only meaningful while `state` is `graded`. */
  grade?: StudyGrade;
  /** Extra content rendered inside the answer face — a mnemonic, typically. */
  answerAside?: ReactNode;
  /** Omit to render an inert card: the element becomes an `<article>`. */
  onReveal?: () => void;
  ariaLabel?: string;
  className?: string;
};

/**
 * The study canvas card.
 *
 * There is **no cursor tilt** here (defect F-08). A ±8° plane tracking the
 * pointer means the text the user is reading is never square to the eye and
 * never still; it was the largest single contributor to the app's floaty
 * quality. The tilt survives only on the marketing showpiece in
 * `Flashcard.tsx`, where the card is looked at rather than read.
 *
 * Both faces occupy the same grid cell, so the card is always as tall as the
 * taller of the two and revealing an answer moves nothing on screen.
 */
export function FlipCard({
  prompt,
  answer,
  state,
  grade,
  answerAside,
  onReveal,
  ariaLabel,
  className,
}: FlipCardProps) {
  const showingAnswer = state !== 'default';

  const faces = (
    <>
      <span className="flip__panel">
        {/*
          The face that is turned away is hidden from assistive technology as
          well as from the eye. Without this a screen-reader user hears the
          answer while the card still reads "question" — the reveal is the
          whole interaction, so leaking it defeats the exercise.
        */}
        <span className="flip__face flip__face--prompt" aria-hidden={showingAnswer}>
          <span className="flip__scroll">
            <span className="flip__body">{prompt}</span>
          </span>
        </span>
        <span className="flip__face flip__face--answer" aria-hidden={!showingAnswer}>
          <span className="flip__scroll">
            <span className="flip__body">{answer}</span>
            {answerAside}
          </span>
        </span>
      </span>
      {/* Focus is four corner rules on the card's bounds (§7.7), never a ring. */}
      <CornerBrackets />
    </>
  );

  if (onReveal) {
    return (
      <button
        type="button"
        onClick={onReveal}
        data-state={state}
        data-grade={grade}
        aria-label={ariaLabel}
        className={cn('flip', className)}
      >
        {faces}
      </button>
    );
  }

  return (
    <article
      data-state={state}
      data-grade={grade}
      aria-label={ariaLabel}
      className={cn('flip', className)}
    >
      {faces}
    </article>
  );
}
