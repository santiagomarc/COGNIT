'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckSquare, Search, Square, Trash2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { bulkDeleteCards, getDeckCardsPage } from '@/app/actions/card';
import { FlashcardWithActions } from '@/components/ui/shared/FlashcardWithActions';
import { ConfirmDialog } from '@/components/ui/shared/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cardFilterPattern } from '@/lib/card-filter';
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
  totalCards?: number;
  errorMessage?: string | null;
};

function mapCardNumbersByCreation(items: DeckCard[]) {
  const oldestFirst = [...items].sort(
    (a, b) => {
      const byCreatedAt = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (byCreatedAt !== 0) {
        return byCreatedAt;
      }

      return a.id.localeCompare(b.id);
    }
  );

  return new Map(oldestFirst.map((card, index) => [card.id, index + 1]));
}

function sortCardsByNumberDesc(items: DeckCard[]) {
  const cardNumberById = mapCardNumbersByCreation(items);
  return [...items].sort((a, b) => {
    const aNumber = cardNumberById.get(a.id) ?? 0;
    const bNumber = cardNumberById.get(b.id) ?? 0;
    return bNumber - aNumber;
  });
}

export function DeckCardsManager({ deckId, cards, totalCards, errorMessage }: DeckCardsManagerProps) {
  const router = useRouter();
  const [deckCards, setDeckCards] = useState(() => sortCardsByNumberDesc(cards));
  // The Cards-tab filter (IA-04). `matches` is null while no filter is active;
  // otherwise it holds the cards the server found, and replaces the list.
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<DeckCard[] | null>(null);
  const [matchesHaveMore, setMatchesHaveMore] = useState(false);
  const [isFiltering, setIsFiltering] = useState(false);
  const filterRequest = useRef(0);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  useEffect(() => {
    setDeckCards(sortCardsByNumberDesc(cards));
  }, [cards]);

  const filterActive = cardFilterPattern(query) !== null;

  // Ask the server once typing pauses. A reply for an earlier query is dropped.
  useEffect(() => {
    if (!filterActive) {
      filterRequest.current += 1;
      setMatches(null);
      setIsFiltering(false);
      return;
    }
    const request = (filterRequest.current += 1);
    setIsFiltering(true);
    const timer = setTimeout(async () => {
      const result = await getDeckCardsPage(deckId, 0, 60, query);
      if (request !== filterRequest.current) return;
      setIsFiltering(false);
      if (result.error || !result.success) {
        toast.error(result.error ?? 'Could not filter the cards.');
        return;
      }
      setMatches(sortCardsByNumberDesc(result.cards));
      setMatchesHaveMore(result.cards.length === 60);
    }, 250);
    return () => clearTimeout(timer);
  }, [query, filterActive, deckId]);

  /** What the grid shows: the filter's matches while one is active, else the loaded cards. */
  const visibleCards = filterActive && matches ? matches : deckCards;

  async function handleLoadMore() {
    setIsLoadingMore(true);
    if (filterActive && matches) {
      const result = await getDeckCardsPage(deckId, matches.length, 60, query);
      setIsLoadingMore(false);
      if (result.error || !result.success) {
        toast.error(result.error ?? 'Failed to load more cards.');
        return;
      }
      setMatches((prev) => {
        const known = new Set((prev ?? []).map((c) => c.id));
        return sortCardsByNumberDesc([...(prev ?? []), ...result.cards.filter((c) => !known.has(c.id))]);
      });
      setMatchesHaveMore(result.cards.length === 60);
      return;
    }
    const result = await getDeckCardsPage(deckId, deckCards.length, 60);
    setIsLoadingMore(false);

    if (result.error || !result.success) {
      toast.error(result.error ?? 'Failed to load more cards.');
      return;
    }

    if (result.cards && result.cards.length > 0) {
      setDeckCards((prev) => {
        const existingIds = new Set(prev.map((c) => c.id));
        const newCards = result.cards.filter((c) => !existingIds.has(c.id));
        return sortCardsByNumberDesc([...prev, ...newCards]);
      });
    }
  }

  const selectedCount = selectedIds.size;
  const allSelected = visibleCards.length > 0 && selectedCount === visibleCards.length;

  const cardNumberById = useMemo(() => mapCardNumbersByCreation(deckCards), [deckCards]);

  function handleSelectionModeToggle() {
    setSelectionMode((prev) => {
      const next = !prev;
      if (!next) {
        setSelectedIds(new Set());
      }
      return next;
    });
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

  function handleSelectAllToggle() {
    if (allSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(visibleCards.map((card) => card.id)));
  }

  function handleCardDeleted(cardId: string) {
    setDeckCards((prev) => prev.filter((card) => card.id !== cardId));
    setMatches((prev) => prev && prev.filter((card) => card.id !== cardId));
    setSelectedIds((prev) => {
      if (!prev.has(cardId)) return prev;
      const next = new Set(prev);
      next.delete(cardId);
      return next;
    });
    router.refresh();
  }

  async function handleBulkDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      return;
    }

    setIsBulkDeleting(true);
    const result = await bulkDeleteCards(ids, deckId);

    if (result?.error) {
      toast.error(typeof result.error === 'string' ? result.error : 'Failed to delete selected cards');
      setIsBulkDeleting(false);
      return;
    }

    const selectedIdSet = new Set(ids);
    setDeckCards((prev) => prev.filter((card) => !selectedIdSet.has(card.id)));
    setMatches((prev) => prev && prev.filter((card) => !selectedIdSet.has(card.id)));
    setSelectedIds(new Set());
    setSelectionMode(false);
    setShowBulkDeleteConfirm(false);
    setIsBulkDeleting(false);

    toast.success(`${ids.length} card${ids.length === 1 ? '' : 's'} deleted`);
    router.refresh();
  }

  if (deckCards.length === 0) {
    if (errorMessage) {
      return (
        <div className="surface p-8 text-center">
          <p className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-[var(--state-lapsed)]">
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
        <p className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
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
        <p className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] tnum text-ink-dimmer">
          {selectionMode
            ? `${selectedCount} of ${visibleCards.length} selected`
            : filterActive
              ? isFiltering && !matches
                ? 'Searching…'
                : `${visibleCards.length}${matchesHaveMore ? '+' : ''} matching`
              : `${deckCards.length} cards`}
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
              <Button type="button" size="sm" variant="ghost" onClick={handleSelectAllToggle}>
                {allSelected ? <Square className="h-3.5 w-3.5" /> : <CheckSquare className="h-3.5 w-3.5" />}
                {allSelected ? 'Clear all' : 'Select all'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={() => setShowBulkDeleteConfirm(true)}
                disabled={selectedCount === 0 || isBulkDeleting}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete selected
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
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find a card by its words"
          aria-label="Find a card by its words"
          autoComplete="off"
          className="pl-9"
        />
      </div>

      {filterActive && matches && visibleCards.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-dim">No card in this deck contains “{query.trim()}”.</p>
      ) : null}

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {visibleCards.map((card) => (
          <div key={card.id}>
            <FlashcardWithActions
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
              onDeleted={() => handleCardDeleted(card.id)}
            />
          </div>
        ))}
      </div>

      {filterActive && matches ? (
        matchesHaveMore ? (
          <div className="mt-8 flex flex-col items-center justify-center gap-2">
            <Button onClick={handleLoadMore} disabled={isLoadingMore}>
              {isLoadingMore ? 'Loading cards…' : 'Load more matches'}
            </Button>
          </div>
        ) : null
      ) : totalCards !== undefined && deckCards.length < totalCards ? (
        <div className="mt-8 flex flex-col items-center justify-center gap-2">
          <Button onClick={handleLoadMore} disabled={isLoadingMore}>
            {isLoadingMore ? 'Loading cards…' : `Load more cards (${deckCards.length} of ${totalCards})`}
          </Button>
        </div>
      ) : null}

      <ConfirmDialog
        open={showBulkDeleteConfirm}
        onOpenChange={setShowBulkDeleteConfirm}
        title={`Delete ${selectedCount} selected card${selectedCount === 1 ? '' : 's'}?`}
        description="This action cannot be undone. The selected flashcards will be permanently removed."
        confirmLabel="Delete selected"
        variant="destructive"
        loading={isBulkDeleting}
        onConfirm={handleBulkDelete}
      />
    </div>
  );
}
