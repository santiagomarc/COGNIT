'use client';

import { m, useReducedMotion } from 'framer-motion';
import { Flame, Target, Trophy } from 'lucide-react';
import { ActivityHeatmap } from './ActivityHeatmap';
import { motionTransitions } from '@/lib/motion-configs';

type StudyStreakCardProps = {
  streak: number;
  longestStreak: number;
  studiedToday: boolean;
  totalStudiedCards: number;
  todayStudiedCount: number;
  todayIso: string;
  activity: { date: string; count: number }[];
};

type Level = {
  name: string;
  min: number;
  next: number | null;
};

const LEVELS: Level[] = [
  { name: 'Rookie', min: 0, next: 100 },
  { name: 'Explorer', min: 100, next: 300 },
  { name: 'Scholar', min: 300, next: 700 },
  { name: 'Sage', min: 700, next: 1500 },
  { name: 'Legend', min: 1500, next: null },
];

function getLevel(totalStudiedCards: number): Level {
  let level = LEVELS[0];
  for (const candidate of LEVELS) {
    if (totalStudiedCards >= candidate.min) {
      level = candidate;
    }
  }
  return level;
}

export function StudyStreakCard({
  streak,
  longestStreak,
  studiedToday,
  totalStudiedCards,
  todayStudiedCount,
  todayIso,
  activity,
}: StudyStreakCardProps) {
  const reduced = useReducedMotion();
  const active = studiedToday;
  const level = getLevel(totalStudiedCards);
  const nextLevelTarget = level.next;
  const dailyGoal = 20;
  const dailyGoalProgress = Math.min(100, Math.round((todayStudiedCount / dailyGoal) * 100));
  const levelProgress =
    nextLevelTarget === null
      ? 100
      : Math.min(
          100,
          Math.round(((totalStudiedCards - level.min) / (nextLevelTarget - level.min)) * 100),
        );
  return (
    <m.div
      initial={false}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={reduced ? { duration: 0 } : { ...motionTransitions.panel, delay: 0.05 }}
      className="glass-card rounded-2xl p-5 md:p-6"
    >
      {/* Flat ground: the two blur orbs and the radial gradient wash that used
          to sit here were the loudest AI-template tell in the dashboard. */}
      <div className="relative overflow-hidden rounded-xl border border-border bg-surface-raised p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${
                active ? 'bg-orange-500/15 border-orange-500/30' : 'bg-muted/20 border-border'
              }`}
            >
              <m.div
                animate={
                  active && !reduced
                    ? {
                        scale: [1, 1.14, 1],
                        rotate: [0, -4, 4, 0],
                      }
                    : undefined
                }
                transition={{
                  duration: 1.4,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              >
                <Flame
                  className={`h-5 w-5 ${
                    active ? 'text-orange-500' : 'text-muted-foreground/60'
                  }`}
                />
              </m.div>
            </div>

            <div>
              <h3 className="text-sm font-semibold tracking-tight text-muted-foreground uppercase">
                Study Activity
              </h3>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-mono text-3xl font-semibold tracking-[-.03em] tnum text-[var(--state-streak)]">{streak}</span>
                <span className="text-sm text-muted-foreground">day streak</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-border-strong bg-primary/10 px-3 py-2">
            <Trophy className="h-4 w-4 text-primary" />
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dimmer">Level</p>
              <p className="text-sm font-semibold">{level.name}</p>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-border bg-background/60 px-3 py-2">
            <p className="text-xs text-muted-foreground">Longest Streak</p>
            <p className="text-lg font-semibold tracking-[-.03em]"><span className="font-mono tnum">{longestStreak}</span> days</p>
          </div>
          <div className="rounded-lg border border-border bg-background/60 px-3 py-2">
            <p className="text-xs text-muted-foreground">Cards Studied</p>
            <p className="font-mono text-lg font-semibold tracking-[-.03em] tnum">{totalStudiedCards}</p>
          </div>
          <div className="rounded-lg border border-border bg-background/60 px-3 py-2">
            <p className="text-xs text-muted-foreground">Today</p>
            <p className="font-mono text-lg font-semibold tracking-[-.03em] tnum">{todayStudiedCount}</p>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Target className="h-3.5 w-3.5" />
                Daily goal: <span className="font-mono tnum">{dailyGoal}</span>&nbsp;cards
              </span>
              <span className="font-mono tnum">{dailyGoalProgress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted/50">
              <m.div
                initial={reduced ? undefined : { width: 0 }}
                animate={{ width: `${dailyGoalProgress}%` }}
                transition={reduced ? { duration: 0 } : motionTransitions.panel}
                className="h-full rounded-full bg-ink-dim"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Progress to next level</span>
              <span className="font-mono tnum">{nextLevelTarget === null ? 'MAX' : `${totalStudiedCards}/${nextLevelTarget}`}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted/50">
              <m.div
                initial={reduced ? undefined : { width: 0 }}
                animate={{ width: `${levelProgress}%` }}
                transition={reduced ? { duration: 0 } : motionTransitions.panel}
                className="h-full rounded-full bg-ink-dim"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-border bg-card/40 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h4 className="text-sm font-semibold tracking-tight">Daily Activity Tracker</h4>
          {!studiedToday ? (
            <p className="text-xs text-orange-400/80">Study today to protect your streak.</p>
          ) : (
            <p className="text-xs text-emerald-400/80">You logged activity today.</p>
          )}
        </div>
        <ActivityHeatmap activity={activity} monthsToShow={6} anchorDate={todayIso} />
      </div>
    </m.div>
  );
}
