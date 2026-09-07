'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { m, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion';
import { motionSprings, tiltSpring } from '@/lib/motion-configs';

type FlipCardProps = {
  front: ReactNode;
  back: ReactNode;
  /** Controlled: the owner decides which face is showing. */
  isFlipped: boolean;
  /** Omit to make the card non-interactive (the parent handles input). */
  onFlip?: () => void;
  className?: string;
  faceClassName?: string;
  ariaLabel?: string;
};

/**
 * The 3D flip visual, extracted from Flashcard.tsx so the study view can reuse
 * it while keeping `showAnswer` in its own state — that state also drives
 * keyboard grading and drag-to-grade, so it cannot live in here.
 *
 * Cursor tilt is disabled on touch devices and under prefers-reduced-motion.
 */
export function FlipCard({
  front,
  back,
  isFlipped,
  onFlip,
  className = 'relative h-56 w-full',
  faceClassName = '',
  ariaLabel,
}: FlipCardProps) {
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

  const body = (
    <m.div
      ref={cardRef}
      className={`${className} gpu-layer`}
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
        transition={prefersReducedMotion ? { duration: 0 } : motionSprings.flip}
        style={{ transformStyle: 'preserve-3d' }}
      >
        <div className={`backface-hidden absolute inset-0 ${faceClassName}`}>{front}</div>
        <div className={`backface-hidden rotate-y-180 absolute inset-0 ${faceClassName}`}>{back}</div>
      </m.div>
    </m.div>
  );

  if (!onFlip) {
    return body;
  }

  return (
    <m.button
      type="button"
      onClick={onFlip}
      className="group w-full text-left perspective-1000"
      aria-label={ariaLabel ?? 'Flip flashcard'}
      aria-pressed={isFlipped}
      whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
    >
      {body}
    </m.button>
  );
}
