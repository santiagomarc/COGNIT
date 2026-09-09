import type { Transition } from 'framer-motion';

/**
 * Motion tokens (design system §5).
 *
 * **Instruments do not bounce.** The previous system used a spring for
 * everything — nine presets, applied to overlays, list items, progress bars and
 * modals alike — which is the largest single contributor to the app's "floaty"
 * quality. Everything here is now a duration and an easing curve.
 *
 * Exactly one spring survives, and it is at the bottom of this file.
 *
 * Every consumer must still gate on `useReducedMotion()`; these tokens describe
 * how a thing moves, not whether it is allowed to.
 */

/** The system's one easing curve for entrances and exits. */
export const EASE_OUT = [0.2, 0.8, 0.2, 1] as const;

export const motionTransitions = {
  /** Focus indicator travel — deliberately linear, so it reads as a reticle. */
  focusTravel: { duration: 0.09, ease: 'linear' } as Transition,

  /** Hover, colour and border changes. */
  hover: { duration: 0.12, ease: 'easeOut' } as Transition,

  /** Key press and release. */
  key: { duration: 0.07, ease: 'easeOut' } as Transition,

  /** Panels, overlays, modals, list items — anything entering or leaving. */
  panel: { duration: 0.16, ease: EASE_OUT } as Transition,

  /** The card flip. */
  flip: { duration: 0.34, ease: EASE_OUT } as Transition,
};

/**
 * The only spring left in the product.
 *
 * It exists because a graded card should feel like it has mass as it leaves the
 * stack — that is the one moment in the app where physical weight communicates
 * something true (the card is done; it is going away). Do not reach for this
 * for anything else; if a second spring appears here, the system has drifted.
 */
export const cardLeaveSpring: Transition = {
  type: 'spring',
  stiffness: 260,
  damping: 24,
};

export function getCappedStaggerDelay(index: number, step = 0.05, max = 0.3) {
  return Math.min(index * step, max);
}
