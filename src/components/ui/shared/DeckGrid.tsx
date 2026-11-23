'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { DeckRow, DeckRowLegend, type DeckRowData } from '@/components/ui/shared/DeckRow';
import { Button } from '@/components/ui/button';
import { Pager } from '@/components/ui/shared/Pager';
import { clampPage, pageCount } from '@/lib/card-pages';
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
  newCount: number;
  dueDrillCount: number;
  easeFactor: number | null;
};

type DeckGridProps = {
  decks: DeckWithCount[];
};

/** One screenful of rows; the decks are all loaded, so a page is only a slice. */
const DECKS_PER_PAGE = 10;

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
    // A deck with only drills due still has work in it; it must not sink
    // below one with nothing due.
    if (b.dueDrillCount !== a.dueDrillCount) {
      return b.dueDrillCount - a.dueDrillCount;
    }
    if (b.newCount !== a.newCount) {
      return b.newCount - a.newCount;
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
  /*
   * Most-due by default (Run 6, Task 2.6). Newest-first is the right order for
   * an account with three decks and the wrong one for an account with twelve and
   * a backlog — the index exists to answer "what do I open now".
   */
  const [sortMode, setSortMode] = useState<DeckSortMode>('most-due');
  const [page, setPage] = useState(1);
  const listRef = useRef<HTMLDivElement>(null);
  const [localDecks, setLocalDecks] = useState(() => decks);

  useEffect(() => {
    setLocalDecks(decks);
  }, [decks]);

  const orderedDecks = useMemo(() => sortDecks(localDecks, sortMode), [localDecks, sortMode]);

  // Clamped, so deleting the last deck on the last page shows the page before it.
  const pages = pageCount(orderedDecks.length, DECKS_PER_PAGE);
  const currentPage = clampPage(page, pages);
  const start = (currentPage - 1) * DECKS_PER_PAGE;
  const pageDecks = orderedDecks.slice(start, start + DECKS_PER_PAGE);

  function goToPage(next: number) {
    setPage(next);
    // Next disables itself on the last page, which would drop keyboard focus.
    listRef.current?.focus({ preventScroll: true });
    listRef.current?.scrollIntoView({ block: 'nearest' });
  }

  const totalCards = useMemo(
    () => localDecks.reduce((sum, d) => sum + (d.cards?.[0]?.count ?? 0), 0),
    [localDecks]
  );

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <h2 className="type-label text-ink-dimmer shrink-0">
            All decks
          </h2>
          <div className="hidden sm:block h-px flex-1 bg-border" />
          <span className="font-mono text-[11px] text-ink-dimmer shrink-0 tnum">
            {pages > 1 ? `${start + 1}–${start + pageDecks.length} of ` : ''}{orderedDecks.length} {orderedDecks.length === 1 ? 'deck' : 'decks'} · {totalCards} cards
          </span>
        </div>

        {/* No filter box: Search in the sidebar (⌘K) reaches every deck by name (sidebar plan D2). */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="inline-flex gap-1" role="group" aria-label="Deck sort mode">
            {SORT_MODES.map((mode) => (
              <Button
                key={mode.value}
                type="button"
                size="sm"
                variant="ghost"
                aria-pressed={sortMode === mode.value}
                onClick={() => {
                  setSortMode(mode.value);
                  setPage(1);
                }}
                className="h-[32px] px-2 text-xs"
              >
                {mode.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {orderedDecks.length === 0 ? (
        <p className="well px-4 py-8 text-center text-sm text-ink-dim">No decks yet. Create one to get started.</p>
      ) : (
        <div
          ref={listRef}
          role="region"
          tabIndex={-1}
          aria-label={pages > 1 ? `Decks, page ${currentPage} of ${pages}` : 'Decks'}
          className="well scroll-mt-16 overflow-hidden px-3.5 outline-hidden"
        >
          <DeckRowLegend />

          {pageDecks.map((deck) => {
            const { cleanTitle, tag } = parseDeckTitleMetadata(deck.title);
            const row: DeckRowData = {
              id: deck.id,
              title: cleanTitle,
              tag,
              cardCount: deck.cards?.[0]?.count ?? 0,
              dueCount: deck.dueCount,
              newCount: deck.newCount,
              dueDrillCount: deck.dueDrillCount,
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

      <Pager label="Deck pages" page={currentPage} pages={pages} onPageChange={goToPage} />
    </section>
  );
}
