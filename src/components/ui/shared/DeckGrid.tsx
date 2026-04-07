'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { DeckActions } from '@/components/ui/shared/DeckActions';
import { DashboardSearch } from '@/components/ui/shared/DashboardSearch';
import { FadeInUp } from '@/components/motion';
import { motion, AnimatePresence } from 'framer-motion';
import { getCappedStaggerDelay, motionSprings } from '@/lib/motion-configs';

function getMasteryBadgeClass(masteryPercentage: number) {
  if (masteryPercentage >= 85) return 'border-sky-500/30 bg-sky-500/15 text-sky-700 dark:text-sky-300';
  if (masteryPercentage >= 60) return 'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300';
  if (masteryPercentage >= 30) return 'border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300';
  return 'border-primary/20 bg-primary/5 text-primary';
}

function getMasteryGlowColor(masteryPercentage: number, assessedCards: number) {
  if (assessedCards === 0) return 'var(--glow)';
  if (masteryPercentage >= 85) return 'rgba(56, 189, 248, 0.38)';
  if (masteryPercentage >= 60) return 'rgba(16, 185, 129, 0.35)';
  if (masteryPercentage >= 30) return 'rgba(245, 158, 11, 0.34)';
  return 'rgba(99, 102, 241, 0.32)';
}

const TAG_ACCENTS: Array<{ tag: string; keywords: string[]; glow: string }> = [
  { tag: 'ai', keywords: ['ai', 'ml', 'llm', 'neural'], glow: 'rgba(139, 92, 246, 0.36)' },
  { tag: 'cs', keywords: ['algorithm', 'data structure', 'system', 'os', 'computer', 'programming'], glow: 'rgba(59, 130, 246, 0.36)' },
  { tag: 'math', keywords: ['math', 'calculus', 'algebra', 'geometry', 'statistics'], glow: 'rgba(14, 165, 233, 0.36)' },
  { tag: 'bio', keywords: ['biology', 'cell', 'anatomy', 'genetics', 'physiology'], glow: 'rgba(16, 185, 129, 0.36)' },
  { tag: 'chem', keywords: ['chemistry', 'organic', 'reaction', 'molecule', 'stoichiometry'], glow: 'rgba(6, 182, 212, 0.35)' },
  { tag: 'physics', keywords: ['physics', 'quantum', 'mechanics', 'thermo', 'electromagnetic'], glow: 'rgba(245, 158, 11, 0.35)' },
  { tag: 'history', keywords: ['history', 'civilization', 'war', 'empire', 'revolution'], glow: 'rgba(249, 115, 22, 0.35)' },
  { tag: 'language', keywords: ['language', 'vocab', 'grammar', 'spanish', 'french', 'english'], glow: 'rgba(236, 72, 153, 0.34)' },
  { tag: 'law', keywords: ['law', 'legal', 'jurisprudence', 'contract'], glow: 'rgba(168, 85, 247, 0.34)' },
  { tag: 'business', keywords: ['finance', 'economics', 'business', 'accounting', 'marketing'], glow: 'rgba(34, 197, 94, 0.34)' },
];

function getExplicitTag(title: string) {
  const bracketTag = title.match(/\[([a-z0-9-]+)]/i)?.[1]?.toLowerCase();
  if (bracketTag) return bracketTag;
  const hashTag = title.match(/#([a-z0-9-]+)/i)?.[1]?.toLowerCase();
  return hashTag ?? null;
}

function inferDeckTag(title: string, description?: string | null) {
  const explicit = getExplicitTag(title);
  if (explicit) return explicit;

  const source = `${title} ${description ?? ''}`.toLowerCase();
  for (const candidate of TAG_ACCENTS) {
    if (candidate.keywords.some((keyword) => source.includes(keyword))) {
      return candidate.tag;
    }
  }

  return null;
}

function getTagGlowColor(tag: string | null) {
  if (!tag) return null;
  const match = TAG_ACCENTS.find((candidate) => candidate.tag === tag);
  return match?.glow ?? 'rgba(129, 140, 248, 0.34)';
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
  description?: string | null;
  created_at: string;
  updated_at: string;
  cards: { count: number }[];
  masteryPercentage: number;
  assessedCards: number;
  lastQuizAt: string | null;
};

type DeckGridProps = {
  decks: DeckWithCount[];
};

type DeckSortMode = 'newest' | 'most-studied';

function sortDecksNewestFirst(items: DeckWithCount[]) {
  return [...items].sort((a, b) => {
    if (b.created_at !== a.created_at) {
      return b.created_at.localeCompare(a.created_at);
    }

    if (b.updated_at !== a.updated_at) {
      return b.updated_at.localeCompare(a.updated_at);
    }

    return a.title.localeCompare(b.title);
  });
}

function sortDecksMostStudied(items: DeckWithCount[]) {
  return [...items].sort((a, b) => {
    if (b.assessedCards !== a.assessedCards) {
      return b.assessedCards - a.assessedCards;
    }

    const aCardCount = a.cards?.[0]?.count ?? 0;
    const bCardCount = b.cards?.[0]?.count ?? 0;
    if (bCardCount !== aCardCount) {
      return bCardCount - aCardCount;
    }

    if (b.updated_at !== a.updated_at) {
      return b.updated_at.localeCompare(a.updated_at);
    }

    return a.title.localeCompare(b.title);
  });
}

function sortDecks(items: DeckWithCount[], sortMode: DeckSortMode) {
  if (sortMode === 'most-studied') {
    return sortDecksMostStudied(items);
  }
  return sortDecksNewestFirst(items);
}

export function DeckGrid({ decks }: DeckGridProps) {
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<DeckSortMode>('newest');
  const [localDecks, setLocalDecks] = useState(() => decks);

  useEffect(() => {
    setLocalDecks(decks);
  }, [decks]);

  const orderedDecks = useMemo(() => sortDecks(localDecks, sortMode), [localDecks, sortMode]);

  const filtered = useMemo(() => {
    if (!search.trim()) return orderedDecks;
    const q = search.toLowerCase();
    return orderedDecks.filter((d) => d.title.toLowerCase().includes(q));
  }, [orderedDecks, search]);

  return (
    <div className="space-y-4">
      {/* Search input */}
      {localDecks.length > 0 && (
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="md:w-full md:max-w-xl">
            <DashboardSearch
              value={search}
              onChange={setSearch}
              resultCount={filtered.length}
              totalCount={orderedDecks.length}
            />
          </div>

          <div
            className="inline-flex self-start rounded-xl border border-primary/20 bg-card/60 p-1 backdrop-blur-sm"
            role="group"
            aria-label="Deck sort mode"
          >
            <button
              type="button"
              onClick={() => setSortMode('newest')}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${sortMode === 'newest'
                ? 'bg-primary/15 text-primary shadow-[0_0_10px_-3px_var(--glow)]'
                : 'text-muted-foreground hover:text-foreground'}`}
              aria-pressed={sortMode === 'newest'}
            >
              Newest
            </button>
            <button
              type="button"
              onClick={() => setSortMode('most-studied')}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${sortMode === 'most-studied'
                ? 'bg-primary/15 text-primary shadow-[0_0_10px_-3px_var(--glow)]'
                : 'text-muted-foreground hover:text-foreground'}`}
              aria-pressed={sortMode === 'most-studied'}
            >
              Most Studied
            </button>
          </div>
        </div>
      )}

      {/* Deck list */}
      {localDecks.length === 0 ? (
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
              const modifiedAt = deck.updated_at || deck.created_at;
              const inferredTag = inferDeckTag(deck.title, deck.description);
              const tagGlow = getTagGlowColor(inferredTag);
              const deckGlow = tagGlow ?? getMasteryGlowColor(deck.masteryPercentage, deck.assessedCards);
              const deckStyle = {
                '--deck-glow': deckGlow,
              } as CSSProperties;
              return (
                <motion.div
                  key={deck.id}
                  layout
                  initial={{ opacity: 0, scale: 0.96, y: 24 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: -24 }}
                  transition={{
                    ...motionSprings.listItem,
                    delay: getCappedStaggerDelay(i),
                  }}
                >
                  <Card
                    className="glass-card glow-border group relative rounded-2xl transition-all duration-300 hover:shadow-[0_0_30px_-10px_var(--deck-glow)]"
                    style={deckStyle}
                  >
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
                          <span>{deckDateFormatter.format(new Date(modifiedAt))}</span>
                          <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[10px] font-medium text-primary">
                            {cardCount} card{cardCount !== 1 ? 's' : ''}
                          </span>
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${getMasteryBadgeClass(deck.masteryPercentage)}`}>
                            {deck.assessedCards > 0 ? `${deck.masteryPercentage}% mastery` : 'No quiz data'}
                          </span>
                          {inferredTag ? (
                            <span
                              className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
                              style={{ borderColor: deckGlow, backgroundColor: 'color-mix(in srgb, var(--deck-glow) 28%, transparent)', color: 'var(--foreground)' }}
                            >
                              {inferredTag}
                            </span>
                          ) : null}
                          <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: deckGlow }} />
                        </CardDescription>
                      </Link>
                      <DeckActions
                        deckId={deck.id}
                        currentTitle={deck.title}
                        onDeleteOptimistic={() => {
                          setLocalDecks((prev) => prev.filter((item) => item.id !== deck.id));
                        }}
                        onDeleteRollback={() => {
                          setLocalDecks((prev) => {
                            if (prev.some((item) => item.id === deck.id)) {
                              return prev;
                            }
                            return [deck, ...prev];
                          });
                        }}
                      />
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
