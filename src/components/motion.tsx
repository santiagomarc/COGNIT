'use client';

import { m, useReducedMotion, type Variants } from 'framer-motion';
import { useSyncExternalStore, type ReactNode } from 'react';
import { motionTransitions } from '@/lib/motion-configs';

/**
 * `false` on the server and on the first client render, `true` afterwards.
 *
 * This is what makes reduced-motion safe to branch on. `useReducedMotion()`
 * cannot know the user's preference during SSR, so any component that renders
 * `initial={reduced ? false : {...}}` directly ships the *animated* markup from
 * the server — `opacity: 0` plus a transform — and a reduced-motion client then
 * renders the resting state, so React finds markup it did not expect and throws
 * a hydration error. Gating on this hook means server and first client render
 * are byte-identical resting states for everyone, and the preference is only
 * consulted once it can actually be read.
 */
export function useHasMounted() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
}

/* ─── Reduced-motion safe defaults ─── */
const noMotion: Variants = {
  hidden: { opacity: 1 },
  show: { opacity: 1 },
};

/* ─── Staggered container: animates children one-by-one ─── */
const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
};

const staggerItem: Variants = {
  hidden: { opacity: 0, y: 24, scale: 0.96 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: motionTransitions.panel,
  },
};

/* ─── Fade-in from below (page-level entrance) ─── */
const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: motionTransitions.panel,
  },
};

export function StaggerContainer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const hasMounted = useHasMounted();
  const reduced = useReducedMotion();
  const resolvedVariants = !hasMounted || reduced ? noMotion : staggerContainer;

  return (
    <m.div
      variants={resolvedVariants}
      initial="hidden"
      animate="show"
      className={className}
    >
      {children}
    </m.div>
  );
}

export function StaggerItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const hasMounted = useHasMounted();
  const reduced = useReducedMotion();

  return (
    <m.div variants={!hasMounted || reduced ? noMotion : staggerItem} className={className}>
      {children}
    </m.div>
  );
}

export function FadeInUp({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const hasMounted = useHasMounted();
  const reduced = useReducedMotion();
  const shouldReduceMotion = !hasMounted || reduced;

  return (
    <m.div
      variants={shouldReduceMotion ? noMotion : fadeInUp}
      initial="hidden"
      animate="show"
      transition={shouldReduceMotion ? undefined : { delay }}
      className={className}
    >
      {children}
    </m.div>
  );
}

/**
 * A section that animates in as it scrolls into view.
 *
 * The landing page is allowed more expressive motion than the app, but it is
 * not allowed a hydration mismatch — so scroll reveals go through here rather
 * than through raw `m.div` + `useReducedMotion()`.
 */
export function RevealOnScroll({
  children,
  className,
  delay = 0,
  as = 'div',
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: 'div' | 'li';
}) {
  const hasMounted = useHasMounted();
  const reduced = useReducedMotion();
  const still = !hasMounted || reduced;
  const Component = as === 'li' ? m.li : m.div;

  return (
    <Component
      initial={still ? false : { opacity: 0, y: 16 }}
      whileInView={still ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={still ? { duration: 0 } : { ...motionTransitions.panel, delay }}
      className={className}
    >
      {children}
    </Component>
  );
}

export function PageTransition({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const hasMounted = useHasMounted();
  const reduced = useReducedMotion();
  const shouldReduceMotion = !hasMounted || reduced;

  return (
    <m.div
      initial={shouldReduceMotion ? undefined : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={shouldReduceMotion ? { duration: 0 } : motionTransitions.panel}
      className={className}
    >
      {children}
    </m.div>
  );
}

export { staggerContainer, staggerItem, fadeInUp };
