'use client';

import { useEffect, useMemo, useState } from 'react';

import { DashboardSearch } from '@/components/ui/shared/DashboardSearch';
import { DeckRow, DeckRowLegend, type DeckRowData } from '@/components/ui/shared/DeckRow';
import { Button } from '@/components/ui/button';
import { parseDeckTitleMetadata } from '@/lib/deck-tags';

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
  dueCount: number;
  easeFactor: number | null;
};

type DeckGridProps = {
  decks: DeckWithCount[];
};

type DeckSortMode = 'newest' | 'most-studied' | 'most-due';

const SORT_MODES: { value: DeckSortMode; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'most-due', label: 'Most due' },
  { value: 'most-studied', label: 'Most studied' },
];

function sortDecksNewestFirst(items: DeckWithCount[]) {
  return [...items].sort((a, b) => {
    if (b.created_at !== a.created_at) {
      return b.created_at.localeCompare(a.created_at);
    }

    if (b.updated_at !== a.updated_at) {
      return b.updated_at.localeCompare(a.updated_at);
    }

    return parseDeckTitleMetadata(a.title).cleanTitle.localeCompare(parseDeckTitleMetadata(b.title).cleanTitle);
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

    return parseDeckTitleMetadata(a.title).cleanTitle.localeCompare(parseDeckTitleMetadata(b.title).cleanTitle);
  });
}

// The order that answers "what should I open right now", which is the question
// a user with eight decks is actually asking.
function sortDecksMostDue(items: DeckWithCount[]) {
  return [...items].sort((a, b) => {
    if (b.dueCount !== a.dueCount) {
      return b.dueCount - a.dueCount;
    }
    return sortDecksNewestFirst([a, b])[0] === a ? -1 : 1;
  });
}

function sortDecks(items: DeckWithCount[], sortMode: DeckSortMode) {
  if (sortMode === 'most-studied') return sortDecksMostStudied(items);
  if (sortMode === 'most-due') return sortDecksMostDue(items);
  return sortDecksNewestFirst(items);
}

/**
 * The deck index (design system §7.5).
 *
 * Decks are rows, not tiles. The old grid was `sm:grid-cols-2` of translucent
 * cards, so a user with eight decks saw four and had to scroll for the rest —
 * and each card carried a mastery-tinted glow built from hard-coded `rgba()`
 * values, which is a hue outside the state channel and a hex in a component
 * (§2.3). Both are gone: mastery is the bar and the tick.
 *
 * There is no enter/exit animation on the list any more either. A staggered
 * spring per row is fine for four tiles and is noise for twenty rows.
 */
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
    return orderedDecks.filter((d) => parseDeckTitleMetadata(d.title).cleanTitle.toLowerCase().includes(q));
  }, [orderedDecks, search]);

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h2 className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
          Decks <span className="tnum">{orderedDecks.length}</span>
        </h2>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="sm:w-72">
            <DashboardSearch
              value={search}
              onChange={setSearch}
              resultCount={filtered.length}
              totalCount={orderedDecks.length}
            />
          </div>

          <div className="inline-flex gap-1" role="group" aria-label="Deck sort mode">
            {SORT_MODES.map((mode) => (
              <Button
                key={mode.value}
                type="button"
                size="sm"
                variant={sortMode === mode.value ? 'secondary' : 'ghost'}
                aria-pressed={sortMode === mode.value}
                onClick={() => setSortMode(mode.value)}
              >
                {mode.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="border-t border-border py-8 text-center text-sm text-muted-foreground">
          {localDecks.length === 0
            ? 'No decks yet. Create one to get started.'
            : `No decks match “${search}”.`}
        </p>
      ) : (
        <div className="border-t border-border">
          <DeckRowLegend />

          {filtered.map((deck) => {
            const { cleanTitle, tag } = parseDeckTitleMetadata(deck.title);
            const row: DeckRowData = {
              id: deck.id,
              title: cleanTitle,
              tag,
              cardCount: deck.cards?.[0]?.count ?? 0,
              dueCount: deck.dueCount,
              easeFactor: deck.easeFactor,
              masteryPercentage: deck.masteryPercentage,
              assessedCards: deck.assessedCards,
              lastQuizAt: deck.lastQuizAt,
            };

            return (
              <DeckRow
                key={deck.id}
                deck={row}
                rawTitle={deck.title}
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
            );
          })}
        </div>
      )}
    </section>
  );
}
