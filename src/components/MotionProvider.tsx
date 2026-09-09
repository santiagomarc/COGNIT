'use client';

import { LazyMotion, domMax } from 'framer-motion';
import type { ReactNode } from 'react';

/**
 * Loads Framer Motion's feature set lazily so it is not part of the initial
 * bundle.
 *
 * `domMax`, not `domAnimation`: this app uses drag — swipe-to-grade in the
 * study view — which does not exist in domAnimation, and the failure is silent:
 * the gesture simply stops working.
 *
 * It used to need `layout` and `layoutId` too, for the deck grid and the
 * floating dock's active pill. Both are gone (§8), so drag is now the only
 * thing holding this at domMax.
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
