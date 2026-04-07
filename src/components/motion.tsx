'use client';

import { motion, useReducedMotion, type Variants } from 'framer-motion';
import { useSyncExternalStore, type ReactNode } from 'react';
import { motionSprings } from '@/lib/motion-configs';

function useHasMounted() {
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
    transition: motionSprings.listItem,
  },
};

/* ─── Fade-in from below (page-level entrance) ─── */
const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: motionSprings.entrance,
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
    <motion.div
      variants={resolvedVariants}
      initial="hidden"
      animate="show"
      className={className}
    >
      {children}
    </motion.div>
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
    <motion.div variants={!hasMounted || reduced ? noMotion : staggerItem} className={className}>
      {children}
    </motion.div>
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
    <motion.div
      variants={shouldReduceMotion ? noMotion : fadeInUp}
      initial="hidden"
      animate="show"
      transition={shouldReduceMotion ? undefined : { delay }}
      className={className}
    >
      {children}
    </motion.div>
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
    <motion.div
      initial={shouldReduceMotion ? undefined : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={shouldReduceMotion ? { duration: 0 } : motionSprings.entrance}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export { staggerContainer, staggerItem, fadeInUp };
