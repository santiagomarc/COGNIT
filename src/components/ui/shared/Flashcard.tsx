'use client';

import { useEffect, useRef, useState } from 'react';
import {
  m,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type SpringOptions,
} from 'framer-motion';

import { motionTransitions } from '@/lib/motion-configs';

/*
 * The cursor tilt lives here and nowhere else (defect F-08, Phase 4.2).
 *
 * It used to sit in the shared `FlipCard`, which meant the study canvas — the
 * one surface in the product that exists to be *read* — carried a ±8° plane
 * tracking the pointer. Text that is never square to the eye and never still is
 * hostile to reading, so the study card is now flat and static.
 *
 * This component is the other case: a showpiece the user looks at rather than
 * studies (the public share page and the deck card list). Here the tilt is the
 * point, so the flip mechanics and the spring moved down here with it rather
 * than being deleted. `motion-configs.ts` still holds exactly one spring — the
 * card leaving the study stack — and this is deliberately not promoted to it.
 */
const tiltSpring: SpringOptions = {
  stiffness: 300,
  damping: 30,
  mass: 0.85,
};

type FlashcardProps = {
  question: string;
  answer: string;
};

/**
 * Uncontrolled preview card used by the deck card list and the public share
 * page. The study view does not use this — it drives `FlipCard` directly, since
 * it owns the reveal state that also gates grading.
 *
 * Cursor tilt is suppressed on touch devices and under prefers-reduced-motion.
 */
export function Flashcard({ question, answer }: FlashcardProps) {
  const [isFlipped, setIsFlipped] = useState(false);
  const [supportsCursorTilt, setSupportsCursorTilt] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const rotateX = useSpring(useTransform(mouseY, [-0.5, 0.5], [8, -8]), tiltSpring);
  const rotateY = useSpring(useTransform(mouseX, [-0.5, 0.5], [-8, 8]), tiltSpring);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const hoverQuery = window.matchMedia('(hover: hover) and (pointer: fine)');
    const updateTiltAvailability = () => {
      setSupportsCursorTilt(hoverQuery.matches && !prefersReducedMotion);
    };

    updateTiltAvailability();

    if (typeof hoverQuery.addEventListener === 'function') {
      hoverQuery.addEventListener('change', updateTiltAvailability);
      return () => hoverQuery.removeEventListener('change', updateTiltAvailability);
    }

    hoverQuery.addListener(updateTiltAvailability);
    return () => hoverQuery.removeListener(updateTiltAvailability);
  }, [prefersReducedMotion]);

  function handleMouseMove(event: React.MouseEvent<HTMLDivElement>) {
    if (!supportsCursorTilt || !cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    mouseX.set((event.clientX - rect.left) / rect.width - 0.5);
    mouseY.set((event.clientY - rect.top) / rect.height - 0.5);
  }

  function handleMouseLeave() {
    if (!supportsCursorTilt) return;
    mouseX.set(0);
    mouseY.set(0);
  }

  return (
    <m.button
      type="button"
      onClick={() => setIsFlipped((prev) => !prev)}
      className="group w-full text-left perspective-1000"
      aria-label="Flip flashcard"
      aria-pressed={isFlipped}
      whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
    >
      <m.div
        ref={cardRef}
        className="gpu-layer relative h-56 w-full"
        style={
          supportsCursorTilt
            ? { rotateX, rotateY, transformStyle: 'preserve-3d' }
            : { transformStyle: 'preserve-3d' }
        }
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
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
              <p className="mb-2 shrink-0 font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
                Question
              </p>
              <p className="min-h-0 flex-1 overflow-y-auto overscroll-contain font-serif text-[27px] leading-[1.25] tracking-[-0.02em] [scrollbar-width:thin]">
                {question}
              </p>
            </div>
          </div>
          <div className="backface-hidden rotate-y-180 absolute inset-0">
            <div className="surface flex h-full flex-col overflow-hidden p-5">
              <p className="mb-2 shrink-0 font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
                Answer
              </p>
              <p className="min-h-0 flex-1 overflow-y-auto overscroll-contain font-serif text-[27px] leading-[1.25] tracking-[-0.02em] text-ink-dim [scrollbar-width:thin]">
                {answer}
              </p>
            </div>
          </div>
        </m.div>
      </m.div>
    </m.button>
  );
}
