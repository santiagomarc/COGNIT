'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckSquare, Search, Square, Trash2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { bulkDeleteCards, deleteCard, getDeckCardsPage } from '@/app/actions/card';
import { FlashcardWithActions } from '@/components/ui/shared/FlashcardWithActions';
import { ConfirmDialog } from '@/components/ui/shared/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Pager } from '@/components/ui/shared/Pager';
import { cardFilterPattern } from '@/lib/card-filter';
import { appendCards, BULK_DELETE_MAX_COUNT, CARDS_PER_PAGE, clampPage, dropCards, pageCount, refreshFirstCards, type CardList } from '@/lib/card-pages';
import { PENDING_DELETE_MS, schedulePendingDelete } from '@/lib/pending-delete';
import { toast } from 'sonner';
import type { CardSource } from '@/index';

type DeckCard = {
  id: string;
  deck_id: string;
  front: string;
  back: string;
  created_at: string;
  source: CardSource | null;
  imported_by: string | null;
  mcq_distractors: string[] | null;
  id_question: string | null;
  topic_tags: string[] | null;
};

type DeckCardsManagerProps = {
  deckId: string;
  cards: DeckCard[];
  totalCards: number;
  errorMessage?: string | null;
};

/** Above this many cards at once, a toast is too small a warning: ask first (FB-01). */
const BULK_CONFIRM_ABOVE = 50;

/** One read of the deck's cards. A dropped connection comes back as an error, like a refusal does. */
async function readCards(deckId: string, offset: number, limit: number, query?: string) {
  try {
    const result = await getDeckCardsPage(deckId, offset, limit, query);
    if (result.success) return { error: null, cards: result.cards as DeckCard[], total: result.total };
    return { error: result.error ?? 'Could not load the cards.' };
  } catch {
    return { error: 'Could not load the cards. Check your connection and try again.' };
  }
}

/** Cards per read. Pages are smaller, so most page turns need no request. */
const CHUNK = 60;
/** The most `getDeckCardsPage` returns at once. */
const CHUNK_MAX = 100;

export function DeckCardsManager({ deckId, cards, totalCards, errorMessage }: DeckCardsManagerProps) {
  const router = useRouter();
  const [deckList, setDeckList] = useState<CardList<DeckCard>>({ cards, total: totalCards });
  // The Cards-tab filter (IA-04). `matches` is null while no filter is active;
  // otherwise it holds the cards the server found, and replaces the list.
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<CardList<DeckCard> | null>(null);
  const [isFiltering, setIsFiltering] = useState(false);
  const filterRequest = useRef(0);
  const filterTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [loadFailed, setLoadFailed] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const moveToList = useRef(false);
  /** Deleted on screen, maybe not yet on the server (FB-01). Never listed, whatever a re-read returns. */
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelectingAll, setIsSelectingAll] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  // A server refresh brings a new first chunk; take it in before painting the old one.
  const [firstCards, setFirstCards] = useState(cards);
  if (firstCards !== cards) {
    setFirstCards(cards);
    setDeckList((prev) => refreshFirstCards(prev, cards, totalCards));
  }

  const filterActive = cardFilterPattern(query) !== null;

  useEffect(() => () => clearTimeout(filterTimer.current), []);

  /** Asks the server once typing pauses. A reply for an earlier query is dropped. */
  function handleQueryChange(next: string) {
    const request = (filterRequest.current += 1);
    clearTimeout(filterTimer.current);
    setQuery(next);
    setLoadFailed(false);
    if (cardFilterPattern(next) === null) {
      // Only leaving a filter goes back to the first page; a first letter typed doesn't.
      if (filterActive) setPage(1);
      setMatches(null);
      setIsFiltering(false);
      return;
    }
    setIsFiltering(true);
    filterTimer.current = setTimeout(async () => {
      const result = await readCards(deckId, 0, CHUNK, next);
      if (request !== filterRequest.current) return;
      setIsFiltering(false);
      if (result.error !== null) {
        setMatches(null);
        toast.error(result.error);
        return;
      }
      setMatches({ cards: result.cards, total: result.total });
      setPage(1);
    }, 250);
  }

  /** What the grid pages through: the filter's matches while one is active, else the deck. */
  const showsMatches = filterActive && matches !== null;
  const list = showsMatches ? matches : deckList;
  const loadedCards = list.cards.filter((card) => !hiddenIds.has(card.id));
  const total = list.total - (list.cards.length - loadedCards.length);

  const pages = pageCount(total);
  const currentPage = clampPage(page, pages);
  const start = (currentPage - 1) * CARDS_PER_PAGE;
  const end = Math.min(start + CARDS_PER_PAGE, total);
  const pageCards = loadedCards.slice(start, end);
  /** How many cards this page needs that haven't been read yet. */
  const missing = Math.max(0, end - loadedCards.length);
  const loadedCount = list.cards.length;

  // Read up to the page being shown. Re-runs while a jump still falls short.
  // The filter's own read owns the list while the query is changing.
  useEffect(() => {
    if (missing === 0 || loadFailed || isFiltering) return;
    let stale = false;
    const limit = Math.min(Math.max(CHUNK, missing), CHUNK_MAX);
    void readCards(deckId, loadedCount, limit, showsMatches ? query : undefined).then((result) => {
      if (stale) return;
      if (result.error !== null) {
        setLoadFailed(true);
        return;
      }
      if (showsMatches) setMatches((prev) => prev && appendCards(prev, result.cards, result.total));
      else setDeckList((prev) => appendCards(prev, result.cards, result.total));
    });
    return () => {
      stale = true;
    };
  }, [missing, loadFailed, isFiltering, loadedCount, showsMatches, query, deckId]);

  function goToPage(next: number) {
    moveToList.current = true;
    setLoadFailed(false);
    setPage(next);
  }

  // The pager sits under the cards, so a new page would otherwise open at its
  // end. Focus goes with the scroll: the region's name announces the new range.
  useEffect(() => {
    if (!moveToList.current) return;
    moveToList.current = false;
    listRef.current?.scrollIntoView({ block: 'start' });
    listRef.current?.focus({ preventScroll: true });
  }, [page]);

  function handleSaved(cardId: string, front: string, back: string) {
    const patch = (prev: CardList<DeckCard>) => ({
      ...prev,
      cards: prev.cards.map((card) => (card.id === cardId ? { ...card, front, back } : card)),
    });
    setDeckList(patch);
    setMatches((prev) => prev && patch(prev));
  }

  const selectedCount = selectedIds.size;
  const pageSelected = pageCards.length > 0 && pageCards.every((card) => selectedIds.has(card.id));
  const rangeLabel = total === 0 ? '0' : `${start + 1}–${end} of ${total}`;

  /** #1 is the deck's oldest card; the list is newest first. */
  const cardNumberById = useMemo(
    () => new Map(deckList.cards.map((card, index) => [card.id, deckList.total - index])),
    [deckList],
  );

  function handleSelectionModeToggle() {
    if (selectionMode) setSelectedIds(new Set());
    setSelectionMode(!selectionMode);
  }

  function handleToggleCardSelection(cardId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) {
        next.delete(cardId);
      } else {
        next.add(cardId);
      }
      return next;
    });
  }

  function handleSelectPageToggle() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const card of pageCards) {
        if (pageSelected) next.delete(card.id);
        else next.add(card.id);
      }
      return next;
    });
  }

  /** Every card in the list, on every page: reads the rest first, since a delete needs their ids. */
  async function handleSelectAll() {
    const request = filterRequest.current;
    setIsSelectingAll(true);
    let all = list;
    while (all.cards.length < all.total) {
      const result = await readCards(deckId, all.cards.length, CHUNK_MAX, showsMatches ? query : undefined);
      // The filter changed meanwhile: "all" no longer means what was asked for.
      if (request !== filterRequest.current || result.error !== null) {
        if (result.error !== null) toast.error(result.error);
        setIsSelectingAll(false);
        return;
      }
      all = appendCards(all, result.cards, result.total);
      if (showsMatches) setMatches((prev) => prev && appendCards(prev, result.cards, result.total));
      else setDeckList((prev) => appendCards(prev, result.cards, result.total));
    }
    setIsSelectingAll(false);
    setSelectedIds(new Set(all.cards.filter((card) => !hiddenIds.has(card.id)).map((card) => card.id)));
  }

  /**
   * Act now, commit later (FB-01): the cards leave the list at once and a toast
   * offers Undo for six seconds; only then does the delete reach the server.
   * Undo puts them back and sends nothing. A failed delete puts them back too.
   */
  function deleteWithUndo(ids: string[]) {
    if (ids.length === 0) return;
    const doomed = new Set(ids);
    const restore = () => setHiddenIds((prev) => new Set([...prev].filter((id) => !doomed.has(id))));

    setHiddenIds((prev) => new Set([...prev, ...doomed]));
    setSelectedIds((prev) => new Set([...prev].filter((id) => !doomed.has(id))));

    const pending = schedulePendingDelete({
      commit: async () => {
        const result = ids.length === 1 ? await deleteCard(ids[0], deckId) : await bulkDeleteCards(ids, deckId);
        if (!result?.error) return null;
        return typeof result.error === 'string' ? result.error : 'Failed to delete.';
      },
      onCommitted: () => {
        setDeckList((prev) => dropCards(prev, doomed));
        setMatches((prev) => prev && dropCards(prev, doomed));
        router.refresh();
      },
      onFailed: (message) => {
        restore();
        toast.error(message);
      },
    });

    toast(`${ids.length} card${ids.length === 1 ? '' : 's'} deleted`, {
      duration: PENDING_DELETE_MS,
      action: {
        label: 'Undo',
        onClick: () => {
          if (pending.undo()) restore();
        },
      },
    });
  }

  function handleBulkDeleteRequest() {
    // The server refuses this too, but only after the cards have left the list.
    if (selectedIds.size > BULK_DELETE_MAX_COUNT) {
      toast.error(`You can delete at most ${BULK_DELETE_MAX_COUNT} cards at once.`);
      return;
    }
    if (selectedIds.size > BULK_CONFIRM_ABOVE) {
      setShowBulkDeleteConfirm(true);
      return;
    }
    handleBulkDelete();
  }

  function handleBulkDelete() {
    const ids = Array.from(selectedIds);
    setShowBulkDeleteConfirm(false);
    setSelectionMode(false);
    deleteWithUndo(ids);
  }

  if (!filterActive && total === 0) {
    if (errorMessage) {
      return (
        <div className="surface p-8 text-center">
          <p className="type-label text-[var(--state-lapsed)]">
            Load failed
          </p>
          <h2 className="mt-3 text-base font-semibold tracking-[-.015em]">
            Unable to load cards right now
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-dim">
            There was a temporary network issue loading this deck&apos;s cards. Your data is safe.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <Button size="sm" variant="primary" onClick={() => router.refresh()}>
              Try again
            </Button>
            <Button asChild size="sm">
              <a href="#add-content">Add a card</a>
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="rounded-[var(--radius-container)] border border-dashed border-border-strong p-8 text-center">
        <p className="type-label text-ink-dimmer">
          Cards
        </p>
        <h2 className="mt-3 text-base font-semibold tracking-[-.015em]">No cards in this deck yet</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-dim">
          Add cards by hand, paste your notes, or generate them from a PDF.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <Button asChild size="sm" variant="primary">
            <a href="#add-content">Add a card</a>
          </Button>
          <Button asChild size="sm">
            <a href="#add-content">Bulk import notes</a>
          </Button>
          <Button asChild size="sm">
            <a href="#add-content">Generate from PDF</a>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <p className="type-label tnum text-ink-dimmer">
          {selectionMode
            ? `${selectedCount} selected`
            : filterActive
              ? isFiltering && !matches
                ? 'Searching…'
                : `${rangeLabel} ${showsMatches ? 'matching' : 'cards'}`
              : `${rangeLabel} cards`}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            aria-pressed={selectionMode}
            onClick={handleSelectionModeToggle}
          >
            {selectionMode ? <X className="h-3.5 w-3.5" /> : <CheckSquare className="h-3.5 w-3.5" />}
            {selectionMode ? 'Cancel' : 'Select'}
          </Button>

          {selectionMode ? (
            <>
              <Button type="button" size="sm" variant="ghost" onClick={handleSelectPageToggle}>
                {pageSelected ? <Square className="h-3.5 w-3.5" /> : <CheckSquare className="h-3.5 w-3.5" />}
                {pageSelected ? 'Clear page' : 'Select page'}
              </Button>
              {pages > 1 && total <= BULK_DELETE_MAX_COUNT ? (
                <Button type="button" size="sm" variant="ghost" onClick={handleSelectAll} disabled={isSelectingAll || isFiltering}>
                  {isSelectingAll ? 'Selecting…' : `Select all ${total}`}
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={handleBulkDeleteRequest}
                disabled={selectedCount === 0 || isSelectingAll}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {/* The count is here because the selection can span pages that aren't on screen. */}
                Delete {selectedCount} selected
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-dimmer"
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <Input
          type="search"
          value={query}
          onChange={(event) => handleQueryChange(event.target.value)}
          placeholder="Find a card by its words"
          aria-label="Find a card by its words"
          autoComplete="off"
          className="pl-9"
        />
      </div>

      {showsMatches && total === 0 ? (
        <p className="py-8 text-center text-sm text-ink-dim">No card in this deck contains “{query.trim()}”.</p>
      ) : null}

      <div
        ref={listRef}
        role="region"
        tabIndex={-1}
        aria-label={`Cards ${rangeLabel}`}
        aria-busy={missing > 0 && !loadFailed}
        className="scroll-mt-16 outline-hidden"
      >
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {pageCards.map((card) => (
            <FlashcardWithActions
              key={card.id}
              cardId={card.id}
              deckId={deckId}
              cardNumber={cardNumberById.get(card.id)}
              term={card.front}
              description={card.back}
              topicTags={card.topic_tags}
              source={card.source ?? 'manual'}
              importedBy={card.imported_by ?? null}
              quizReady={Boolean(card.id_question) && Array.isArray(card.mcq_distractors) && card.mcq_distractors.length >= 3}
              selectionMode={selectionMode}
              selected={selectedIds.has(card.id)}
              onToggleSelected={() => handleToggleCardSelection(card.id)}
              onSaved={(front, back) => handleSaved(card.id, front, back)}
              onDelete={() => deleteWithUndo([card.id])}
            />
          ))}
          {missing > 0 && !loadFailed
            ? Array.from({ length: end - start - pageCards.length }, (_, index) => (
              <div key={`loading-${index}`} aria-hidden="true" className="glass-skeleton h-64 rounded-[var(--radius-container)]" />
            ))
            : null}
        </div>
        {missing > 0 && loadFailed ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="text-sm text-ink-dim" role="alert">These cards couldn&apos;t be loaded.</p>
            <Button type="button" size="sm" onClick={() => setLoadFailed(false)}>
              Try again
            </Button>
          </div>
        ) : null}
      </div>

      <Pager label="Card pages" page={currentPage} pages={pages} onPageChange={goToPage} />

      <ConfirmDialog
        open={showBulkDeleteConfirm}
        onOpenChange={setShowBulkDeleteConfirm}
        title={`Delete ${selectedCount} selected card${selectedCount === 1 ? '' : 's'}?`}
        description="They leave the deck now; you can undo for a few seconds afterwards."
        confirmLabel="Delete selected"
        variant="destructive"
        onConfirm={handleBulkDelete}
      />
    </div>
  );
}
