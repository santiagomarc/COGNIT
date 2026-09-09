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
          <div className="backface-hidden absolute inset-0">
            <div className="h-full rounded-2xl border border-border-strong bg-card/60 p-6 text-card-foreground shadow-lg backdrop-blur-xl">
              <div className="mb-3 flex items-center gap-2">
                <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                <p className="text-xs font-semibold uppercase tracking-widest text-primary/80">Question</p>
              </div>
              <p className="line-clamp-6 font-serif text-lg leading-[1.32]">{question}</p>
            </div>
          </div>
          <div className="backface-hidden rotate-y-180 absolute inset-0">
            <div className="h-full rounded-2xl border border-border-strong bg-card/60 p-6 text-card-foreground shadow-lg backdrop-blur-md">
              <div className="mb-3 flex items-center gap-2">
                <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                <p className="text-xs font-semibold uppercase tracking-widest text-ink-dim">Answer</p>
              </div>
              <p className="line-clamp-6 font-serif text-lg leading-[1.32] text-foreground/90">{answer}</p>
            </div>
          </div>
        </m.div>
      </m.div>
    </m.button>
  );
}
