'use client';

import { LazyMotion, domMax } from 'framer-motion';
import type { ReactNode } from 'react';

/**
 * Loads Framer Motion's feature set lazily so it is not part of the initial
 * bundle.
 *
 * `domMax`, not `domAnimation`: this app uses drag (swipe-to-grade in the study
 * view), `layout` (DeckGrid) and `layoutId` (the DockNav active pill). None of
 * those exist in domAnimation, and the failure is silent — the animation simply
 * stops happening.
 *
 * `strict` makes any remaining `motion.*` throw instead of quietly loading the
 * full bundle, which is how a missed conversion gets caught.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domMax} strict>
      {children}
    </LazyMotion>
  );
}
