'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { Clock, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

type DueTodayCardProps = {
  totalDue: number;
  deckBreakdown: { deckId: string; deckTitle: string; dueCount: number }[];
};

export function DueTodayCard({ totalDue, deckBreakdown }: DueTodayCardProps) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      initial={reduced ? undefined : { opacity: 0, y: 20, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 20 }}
      className="glass-card glow-border rounded-2xl p-5"
    >
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
          <Clock className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold tracking-tight text-muted-foreground uppercase">
            Due Today
          </h3>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="glow-title text-3xl font-extrabold tracking-tight">
              {totalDue}
            </span>
            <span className="text-sm text-muted-foreground">
              card{totalDue !== 1 ? 's' : ''} to review
            </span>
          </div>
        </div>
      </div>

      {totalDue > 0 && deckBreakdown.length > 0 && (
        <div className="mt-4 space-y-2">
          {deckBreakdown.slice(0, 3).map((deck) => (
            <Link
              key={deck.deckId}
              href={`/dashboard/${deck.deckId}/study`}
              className="group flex items-center justify-between rounded-lg border border-primary/10 bg-card/30 px-3 py-2 transition-all hover:border-primary/25 hover:bg-primary/5"
            >
              <span className="text-sm font-medium truncate">{deck.deckTitle}</span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground group-hover:text-primary transition-colors">
                {deck.dueCount} due
                <ArrowRight className="h-3 w-3" />
              </span>
            </Link>
          ))}
          {deckBreakdown.length > 3 && (
            <p className="text-xs text-muted-foreground text-center pt-1">
              +{deckBreakdown.length - 3} more deck{deckBreakdown.length - 3 !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      )}

      {totalDue === 0 && (
        <p className="mt-3 text-sm text-muted-foreground">
          You&apos;re all caught up! No cards due for review right now.
        </p>
      )}
    </motion.div>
  );
}
