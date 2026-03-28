'use client';

import { useEffect, useMemo, useState } from 'react';
import { BookOpen, CheckSquare, Square, Trash2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { bulkDeleteCards } from '@/app/actions';
import { FlashcardWithActions } from '@/components/ui/shared/FlashcardWithActions';
import { ConfirmDialog } from '@/components/ui/shared/ConfirmDialog';
import { Button } from '@/components/ui/button';
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
};

type DeckCardsManagerProps = {
  deckId: string;
  cards: DeckCard[];
};

function sortCardsNewestFirst(items: DeckCard[]) {
  return [...items].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export function DeckCardsManager({ deckId, cards }: DeckCardsManagerProps) {
  const router = useRouter();
  const [deckCards, setDeckCards] = useState(() => sortCardsNewestFirst(cards));
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  useEffect(() => {
    setDeckCards(sortCardsNewestFirst(cards));
  }, [cards]);

  const selectedCount = selectedIds.size;
  const allSelected = deckCards.length > 0 && selectedCount === deckCards.length;

  const cardNumberById = useMemo(() => {
    return new Map(deckCards.map((card, index) => [card.id, index + 1]));
  }, [deckCards]);

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
    setSelectedIds(new Set(deckCards.map((card) => card.id)));
  }

  function handleCardDeleted(cardId: string) {
    setDeckCards((prev) => prev.filter((card) => card.id !== cardId));
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
    setSelectedIds(new Set());
    setSelectionMode(false);
    setShowBulkDeleteConfirm(false);
    setIsBulkDeleting(false);

    toast.success(`${ids.length} card${ids.length === 1 ? '' : 's'} deleted`);
    router.refresh();
  }

  if (deckCards.length === 0) {
    return (
      <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-primary/20 bg-card/30 backdrop-blur-md p-8 text-center">
        <BookOpen className="mb-4 h-10 w-10 text-muted-foreground" />
        <h2 className="text-xl font-semibold tracking-tight">No cards in this deck yet</h2>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Add your first flashcard above to start studying, or generate cards from your notes in the next step.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/15 bg-card/25 p-3">
        <div className="text-sm text-muted-foreground">
          {selectionMode
            ? `${selectedCount} of ${deckCards.length} selected`
            : `${deckCards.length} cards`}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={selectionMode ? 'secondary' : 'outline'}
            onClick={handleSelectionModeToggle}
          >
            {selectionMode ? <X className="h-3.5 w-3.5" /> : <CheckSquare className="h-3.5 w-3.5" />}
            {selectionMode ? 'Cancel' : 'Select'}
          </Button>

          {selectionMode ? (
            <>
              <Button type="button" size="sm" variant="ghost" onClick={handleSelectAllToggle}>
                {allSelected ? <Square className="h-3.5 w-3.5" /> : <CheckSquare className="h-3.5 w-3.5" />}
                {allSelected ? 'Clear All' : 'Select All'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={() => setShowBulkDeleteConfirm(true)}
                disabled={selectedCount === 0 || isBulkDeleting}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete Selected
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {deckCards.map((card) => (
          <div key={card.id}>
            <FlashcardWithActions
              cardId={card.id}
              deckId={deckId}
              cardNumber={cardNumberById.get(card.id)}
              term={card.front}
              description={card.back}
              source={card.source ?? 'manual'}
              importedBy={card.imported_by ?? null}
              quizReady={Boolean(card.id_question) && Array.isArray(card.mcq_distractors) && card.mcq_distractors.length >= 2}
              selectionMode={selectionMode}
              selected={selectedIds.has(card.id)}
              onToggleSelected={() => handleToggleCardSelection(card.id)}
              onDeleted={() => handleCardDeleted(card.id)}
            />
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={showBulkDeleteConfirm}
        onOpenChange={setShowBulkDeleteConfirm}
        title={`Delete ${selectedCount} selected card${selectedCount === 1 ? '' : 's'}?`}
        description="This action cannot be undone. The selected flashcards will be permanently removed."
        confirmLabel="Delete Selected"
        variant="destructive"
        loading={isBulkDeleting}
        onConfirm={handleBulkDelete}
      />
    </div>
  );
}
