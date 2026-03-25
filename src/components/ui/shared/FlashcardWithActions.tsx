'use client';

import { useState, useTransition } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Pencil, Trash2, X, Check, Square, CheckSquare } from 'lucide-react';
import { Flashcard } from '@/components/ui/shared/Flashcard';
import { ConfirmDialog } from '@/components/ui/shared/ConfirmDialog';
import { updateCard, deleteCard, enrichCards } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { formatActionError } from '@/lib/ai-feedback';
import { toast } from 'sonner';
import type { CardSource } from '@/index';

type FlashcardWithActionsProps = {
  cardId: string;
  deckId: string;
  cardNumber?: number;
  term: string;
  description: string;
  source: CardSource;
  importedBy: string | null;
  quizReady: boolean;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelected?: () => void;
  onDeleted?: () => void;
};

const SOURCE_LABELS: Record<CardSource, string> = {
  manual: 'Manual',
  ai_pdf: 'AI PDF',
  bulk_import: 'Bulk Import',
  ai_cleaned: 'AI Cleaned',
};

export function FlashcardWithActions({
  cardId,
  deckId,
  cardNumber,
  term,
  description,
  source,
  importedBy,
  quizReady,
  selectionMode = false,
  selected = false,
  onToggleSelected,
  onDeleted,
}: FlashcardWithActionsProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editableTerm, setEditableTerm] = useState(term);
  const [editableDescription, setEditableDescription] = useState(description);
  const [isLoading, setIsLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [, startEnrichmentTransition] = useTransition();

  async function handleSave() {
    setIsLoading(true);
    const result = await updateCard({
      id: cardId,
      deck_id: deckId,
      front: editableTerm,
      back: editableDescription,
    });
    if (result?.error) {
      toast.error(typeof result.error === 'string' ? result.error : 'Failed to update card');
    } else {
      toast.success('Card updated');
      setIsEditing(false);
      startEnrichmentTransition(async () => {
        const enrichmentResult = await enrichCards({ deck_id: deckId, card_ids: [cardId] });
        if (enrichmentResult?.error) {
          toast(formatActionError(enrichmentResult.error, 'Quiz enhancement will be prepared later.'));
        }
      });
    }
    setIsLoading(false);
  }

  async function handleDelete() {
    setIsLoading(true);
    const result = await deleteCard(cardId, deckId);
    if (result?.error) {
      toast.error(typeof result.error === 'string' ? result.error : 'Failed to delete card');
    } else {
      toast.success('Card deleted');
      onDeleted?.();
    }
    setIsLoading(false);
    setShowDeleteConfirm(false);
  }

  return (
    <div className={`group relative ${selectionMode && selected ? 'rounded-2xl ring-2 ring-primary/40 ring-offset-2 ring-offset-background' : ''}`}>
      <AnimatePresence mode="wait">
        {isEditing ? (
          <motion.div
            key="edit"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            className="glass-card glow-border flex h-56 flex-col gap-3 rounded-2xl p-5"
          >
            <Input
              value={editableTerm}
              onChange={(e) => setEditableTerm(e.target.value)}
              placeholder="Term (answer)"
              className="neon-focus text-sm"
              autoFocus
            />
            <Textarea
              value={editableDescription}
              onChange={(e) => setEditableDescription(e.target.value)}
              placeholder="Description (question)"
              className="neon-focus min-h-0 flex-1 resize-none text-sm leading-relaxed"
            />

            <div className="mt-auto flex items-center justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setIsEditing(false);
                  setEditableTerm(term);
                  setEditableDescription(description);
                }}
                disabled={isLoading}
              >
                <X className="mr-1 h-3.5 w-3.5" />
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={isLoading}
              >
                <Check className="mr-1 h-3.5 w-3.5" />
                {isLoading ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="view"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="space-y-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex max-w-[75%] flex-wrap gap-1">
                {typeof cardNumber === 'number' ? (
                  <span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-primary backdrop-blur-sm">
                    Card #{cardNumber}
                  </span>
                ) : null}
                <span className="rounded-full border border-primary/20 bg-card/80 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-primary backdrop-blur-sm">
                  {SOURCE_LABELS[source]}
                </span>
                <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.2em] backdrop-blur-sm ${quizReady ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/20 bg-amber-500/10 text-amber-300'}`}>
                  {quizReady ? 'Quiz Ready' : 'Quiz Pending'}
                </span>
                {importedBy ? (
                  <span className="rounded-full border border-primary/15 bg-card/80 px-2 py-1 text-[10px] text-muted-foreground backdrop-blur-sm">
                    {importedBy}
                  </span>
                ) : null}
              </div>

              {selectionMode ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleSelected?.();
                  }}
                  className="z-20 flex h-8 w-8 items-center justify-center rounded-lg bg-card/80 backdrop-blur-sm border border-primary/20 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                  title={selected ? 'Unselect card' : 'Select card'}
                  aria-pressed={selected}
                >
                  {selected ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
                </button>
              ) : (
                <div className="z-20 flex gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100 max-sm:opacity-100">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsEditing(true);
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-card/80 backdrop-blur-sm border border-primary/20 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                    title="Edit card"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowDeleteConfirm(true);
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-card/80 backdrop-blur-sm border border-destructive/20 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    title="Delete card"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>

            <Flashcard question={description} answer={term} />
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title="Delete this card?"
        description="This action cannot be undone. The flashcard will be permanently removed."
        confirmLabel="Delete"
        variant="destructive"
        loading={isLoading}
        onConfirm={handleDelete}
      />
    </div>
  );
}
