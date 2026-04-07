import type { SpringOptions } from 'framer-motion';

export const motionSprings = {
  entrance: { type: 'spring' as const, stiffness: 300, damping: 24 },
  listItem: { type: 'spring' as const, stiffness: 300, damping: 24 },
  flip: { type: 'spring' as const, stiffness: 290, damping: 22 },
  dock: { type: 'spring' as const, stiffness: 320, damping: 28 },
  activePill: { type: 'spring' as const, stiffness: 360, damping: 30 },
  modal: { type: 'spring' as const, stiffness: 320, damping: 28 },
  quizPanel: { type: 'spring' as const, stiffness: 300, damping: 24 },
  quizProgress: { type: 'spring' as const, stiffness: 220, damping: 24 },
  overlay: { type: 'spring' as const, stiffness: 260, damping: 28 },
};

export const tiltSpring: SpringOptions = {
  stiffness: 300,
  damping: 30,
  mass: 0.85,
};

export function getCappedStaggerDelay(index: number, step = 0.05, max = 0.3) {
  return Math.min(index * step, max);
}
