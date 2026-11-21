'use client';

import { useState } from 'react';
import { m, useReducedMotion } from 'framer-motion';

import { motionTransitions } from '@/lib/motion-configs';

type FlashcardProps = {
  question: string;
  answer: string;
};

/**
 * The preview card on the deck's Cards tab and the public share page: tap to
 * flip. The study view doesn't use this; it drives `FlipCard`, which owns the
 * reveal state that also gates grading.
 *
 * It used to tilt ±8° after the cursor on two springs, as a "showpiece". It
 * doesn't any more (UIUX plan VIS-02): these cards are read, not admired, and
 * text that is never square to the eye is hard to read (the reason the study
 * card lost the same tilt, defect F-08). The flip stays.
 */
export function Flashcard({ question, answer }: FlashcardProps) {
  const [isFlipped, setIsFlipped] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  return (
    <m.button
      type="button"
      onClick={() => setIsFlipped((prev) => !prev)}
      className="group w-full text-left perspective-1000"
      aria-label="Flip flashcard"
      aria-pressed={isFlipped}
      whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
    >
      <div className="gpu-layer relative h-56 w-full" style={{ transformStyle: 'preserve-3d' }}>
        <m.div
          className="relative h-full w-full"
          animate={{ rotateY: isFlipped ? 180 : 0 }}
          transition={prefersReducedMotion ? { duration: 0 } : motionTransitions.flip}
          style={{ transformStyle: 'preserve-3d' }}
        >
          {/*
            Opaque, one rule, one chamfer (§7.1). The two translucent blurred
            faces this replaces were the last non-scrim `backdrop-blur` in the
            product, and they degraded the contrast of the very text the card
            exists to show.

            Neither face clamps (defect F-02): `line-clamp` puts
            `overflow: hidden` on the paragraph, so it never overflows its face
            and the face's own scroll has nothing to scroll — the text ends up
            truncated *and* unreachable. Each face scrolls instead.
          */}
          <div className="backface-hidden absolute inset-0">
            <div className="surface flex h-full flex-col overflow-hidden p-5">
              <p className="mb-2 shrink-0 type-label text-ink-dimmer">
                Question
              </p>
              <p className="min-h-0 flex-1 overflow-y-auto overscroll-contain font-serif type-study-md leading-[1.25] tracking-[-0.02em] [scrollbar-width:thin]">
                {question}
              </p>
            </div>
          </div>
          <div className="backface-hidden rotate-y-180 absolute inset-0">
            <div className="surface flex h-full flex-col overflow-hidden p-5">
              <p className="mb-2 shrink-0 type-label text-ink-dimmer">
                Answer
              </p>
              <p className="min-h-0 flex-1 overflow-y-auto overscroll-contain font-serif type-study-md leading-[1.25] tracking-[-0.02em] text-ink-dim [scrollbar-width:thin]">
                {answer}
              </p>
            </div>
          </div>
        </m.div>
      </div>
    </m.button>
  );
}
