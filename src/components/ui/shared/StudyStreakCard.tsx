'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { Flame } from 'lucide-react';

type StudyStreakCardProps = {
  streak: number;
  longestStreak: number;
  studiedToday: boolean;
};

export function StudyStreakCard({ streak, longestStreak, studiedToday }: StudyStreakCardProps) {
  const reduced = useReducedMotion();
  const active = streak > 0 && studiedToday;

  return (
    <motion.div
      initial={reduced ? undefined : { opacity: 0, y: 20, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.05 }}
      className="glass-card glow-border rounded-2xl p-5"
    >
      <div className="flex items-start gap-4">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${
            active
              ? 'bg-orange-500/15 border-orange-500/25'
              : 'bg-muted/20 border-primary/15'
          }`}
        >
          <motion.div
            animate={
              active && !reduced
                ? {
                    scale: [1, 1.15, 1],
                    rotate: [0, -5, 5, 0],
                  }
                : undefined
            }
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          >
            <Flame
              className={`h-5 w-5 ${
                active ? 'text-orange-500' : 'text-muted-foreground/60'
              }`}
            />
          </motion.div>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold tracking-tight text-muted-foreground uppercase">
            Study Streak
          </h3>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="glow-title text-3xl font-extrabold tracking-tight">
              {streak}
            </span>
            <span className="text-sm text-muted-foreground">
              day{streak !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-lg border border-primary/10 bg-card/30 px-3 py-2">
        <span className="text-xs text-muted-foreground">Best streak</span>
        <span className="text-sm font-semibold">
          {longestStreak} day{longestStreak !== 1 ? 's' : ''}
        </span>
      </div>

      {!studiedToday && streak > 0 && (
        <p className="mt-3 text-xs text-orange-400/80">
          Study today to keep your {streak}-day streak alive!
        </p>
      )}

      {!studiedToday && streak === 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          Start studying to build your streak!
        </p>
      )}

      {studiedToday && (
        <p className="mt-3 text-xs text-emerald-400/80">
          ✓ You&apos;ve studied today — keep it up!
        </p>
      )}
    </motion.div>
  );
}
