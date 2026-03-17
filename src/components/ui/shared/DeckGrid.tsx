'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { DeckActions } from '@/components/ui/shared/DeckActions';
import { DashboardSearch } from '@/components/ui/shared/DashboardSearch';
import { FadeInUp } from '@/components/motion';
import { motion, AnimatePresence } from 'framer-motion';

function getMasteryBadgeClass(masteryPercentage: number) {
  if (masteryPercentage >= 85) return 'border-sky-500/20 bg-sky-500/10 text-sky-300';
  if (masteryPercentage >= 60) return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300';
  if (masteryPercentage >= 30) return 'border-amber-500/20 bg-amber-500/10 text-amber-300';
  return 'border-primary/20 bg-primary/5 text-primary';
}

const deckDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

type DeckWithCount = {
  id: string;
  title: string;
  created_at: string;
  cards: { count: number }[];
  masteryPercentage: number;
  assessedCards: number;
  lastQuizAt: string | null;
};

type DeckGridProps = {
  decks: DeckWithCount[];
};

export function DeckGrid({ decks }: DeckGridProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return decks;
    const q = search.toLowerCase();
    return decks.filter((d) => d.title.toLowerCase().includes(q));
  }, [decks, search]);

  return (
    <div className="space-y-4">
      {/* Search input */}
      {decks.length > 0 && (
        <DashboardSearch
          value={search}
          onChange={setSearch}
          resultCount={filtered.length}
          totalCount={decks.length}
        />
      )}

      {/* Deck list */}
      {decks.length === 0 ? (
        <FadeInUp delay={0.2}>
          <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-primary/20 bg-card/40 backdrop-blur-md p-8 text-center">
            <BookOpen className="mb-4 h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">No decks yet. Create one to get started!</p>
          </div>
        </FadeInUp>
      ) : filtered.length === 0 ? (
        <FadeInUp>
          <div className="flex min-h-36 flex-col items-center justify-center rounded-2xl border border-dashed border-primary/15 bg-card/30 backdrop-blur-md p-6 text-center">
            <p className="text-sm text-muted-foreground">
              No decks match &ldquo;{search}&rdquo;
            </p>
          </div>
        </FadeInUp>
      ) : (
        <motion.div className="grid gap-4 sm:grid-cols-2" layout>
          <AnimatePresence mode="popLayout">
            {filtered.map((deck, i) => {
              const cardCount = deck.cards?.[0]?.count ?? 0;
              return (
                <motion.div 
                  key={deck.id}
                  layout
                  initial={{ opacity: 0, scale: 0.96, y: 24 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: -24 }}
                  transition={{ 
                    type: 'spring', 
                    stiffness: 260, 
                    damping: 20,
                    delay: Math.min(i * 0.05, 0.3) 
                  }}
                >
                  <Card className="glass-card glow-border group relative rounded-2xl transition-all duration-300">
                    <CardHeader>
                    <div className="flex justify-between items-start">
                      <Link
                        href={`/dashboard/${deck.id}`}
                        className="space-y-1.5 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring flex-1 min-w-0"
                      >
                        <CardTitle className="group-hover:text-primary transition-colors duration-200 truncate">
                          {deck.title}
                        </CardTitle>
                        <CardDescription className="flex flex-wrap items-center gap-2 text-xs">
                          <span>{deckDateFormatter.format(new Date(deck.created_at))}</span>
                          <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[10px] font-medium text-primary">
                            {cardCount} card{cardCount !== 1 ? 's' : ''}
                          </span>
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${getMasteryBadgeClass(deck.masteryPercentage)}`}>
                            {deck.assessedCards > 0 ? `${deck.masteryPercentage}% mastery` : 'No quiz data'}
                          </span>
                        </CardDescription>
                      </Link>
                      <DeckActions deckId={deck.id} currentTitle={deck.title} />
                    </div>
                  </CardHeader>
                </Card>
              </motion.div>
            );
          })}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}
