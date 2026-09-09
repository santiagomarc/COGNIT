'use client';

import { useState } from 'react';
import { m, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Pencil, Trash2, X, Check, Square, CheckSquare } from 'lucide-react';
import { Flashcard } from '@/components/ui/shared/Flashcard';
import { ConfirmDialog } from '@/components/ui/shared/ConfirmDialog';
import { motionTransitions } from '@/lib/motion-configs';
import { updateCard, deleteCard } from '@/app/actions/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import type { CardSource } from '@/index';

type FlashcardWithActionsProps = {
  cardId: string;
  deckId: string;
  cardNumber?: number;
  term: string;
  description: string;
  topicTags: string[] | null;
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
  topicTags,
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
  const reduced = useReducedMotion();

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
    <div
      className={`group relative ${
        selectionMode && selected
          ? 'rounded-[var(--radius-container)] outline outline-2 outline-offset-2 outline-[var(--accent)]'
          : ''
      }`}
    >
      <AnimatePresence mode="wait">
        {isEditing ? (
          <m.div
            key="edit"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={reduced ? { duration: 0 } : motionTransitions.panel}
            className="surface flex h-56 flex-col gap-3 p-5"
          >
            <Input
              value={editableTerm}
              onChange={(e) => setEditableTerm(e.target.value)}
              placeholder="Term (answer)"
              className="text-sm"
              autoFocus
            />
            <Textarea
              value={editableDescription}
              onChange={(e) => setEditableDescription(e.target.value)}
              placeholder="Description (question)"
              className="min-h-0 flex-1 resize-none text-sm leading-relaxed"
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
                {isLoading ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </m.div>
        ) : (
          <m.div
            key="view"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="space-y-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex max-w-[75%] flex-wrap items-baseline gap-x-3 gap-y-1 font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
                {typeof cardNumber === 'number' ? (
                  <span className="tnum">#{cardNumber}</span>
                ) : null}
                <span>{SOURCE_LABELS[source]}</span>
                {/* The only state on this card, so the only thing that may take
                    a hue — and the word carries it too (§2.3). */}
                <span
                  style={{
                    color: quizReady ? 'var(--state-mastered)' : 'var(--state-learning)',
                  }}
                >
                  {quizReady ? 'Quiz ready' : 'Quiz pending'}
                </span>
                {importedBy ? <span className="truncate normal-case tracking-normal">{importedBy}</span> : null}
              </div>

              {selectionMode ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleSelected?.();
                  }}
                  className="z-20 flex h-8 w-8 items-center justify-center rounded-[var(--radius-control)] border border-[var(--border-control)] text-ink-dimmer transition-colors outline-none hover:bg-surface-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
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
                    className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-control)] border border-[var(--border-control)] text-ink-dimmer transition-colors outline-none hover:bg-surface-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
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
                    className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-control)] border border-[var(--border-control)] text-ink-dimmer transition-colors outline-none hover:border-[var(--state-lapsed)] hover:text-[var(--state-lapsed)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                    title="Delete card"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>

            <Flashcard question={description} answer={term} />
            {Array.isArray(topicTags) && topicTags.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {topicTags.map((tag) => (
                  <span
                    key={`${cardId}-${tag}`}
                    className="rounded-[var(--radius-control)] border border-border px-2 py-0.5 font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
          </m.div>
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
