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
  /*
   * Most-due by default (Run 6, Task 2.6). Newest-first is the right order for
   * an account with three decks and the wrong one for an account with twelve and
   * a backlog — the index exists to answer "what do I open now".
   */
  const [sortMode, setSortMode] = useState<DeckSortMode>('most-due');
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

  const totalCards = useMemo(
    () => localDecks.reduce((sum, d) => sum + (d.cards?.[0]?.count ?? 0), 0),
    [localDecks]
  );

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <h2 className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer shrink-0">
            All decks
          </h2>
          <div className="hidden sm:block h-px flex-1 bg-border" />
          <span className="font-mono text-[11px] text-ink-dimmer shrink-0 tnum">
            {orderedDecks.length} {orderedDecks.length === 1 ? 'deck' : 'decks'} · {totalCards} cards
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="w-36 sm:w-48">
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
                variant="ghost"
                aria-pressed={sortMode === mode.value}
                onClick={() => setSortMode(mode.value)}
                className="h-[32px] px-2 text-xs"
              >
                {mode.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="well px-4 py-8 text-center text-sm text-muted-foreground">
          {localDecks.length === 0
            ? 'No decks yet. Create one to get started.'
            : `No decks match “${search}”.`}
        </p>
      ) : (
        <div className="well overflow-hidden px-3.5">
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
