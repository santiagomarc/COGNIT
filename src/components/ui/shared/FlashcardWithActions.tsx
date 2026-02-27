'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Pencil, Trash2, X, Check } from 'lucide-react';
import { Flashcard } from '@/components/ui/shared/Flashcard';
import { ConfirmDialog } from '@/components/ui/shared/ConfirmDialog';
import { updateCard, deleteCard } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

type FlashcardWithActionsProps = {
  cardId: string;
  deckId: string;
  question: string;
  answer: string;
};

export function FlashcardWithActions({ cardId, deckId, question, answer }: FlashcardWithActionsProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [front, setFront] = useState(question);
  const [back, setBack] = useState(answer);
  const [isLoading, setIsLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  async function handleSave() {
    setIsLoading(true);
    const result = await updateCard({ id: cardId, deck_id: deckId, front, back });
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
    }
    setIsLoading(false);
    setShowDeleteConfirm(false);
  }

  return (
    <div className="group relative">
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
              value={front}
              onChange={(e) => setFront(e.target.value)}
              placeholder="Question"
              className="neon-focus text-sm"
              autoFocus
            />
            <Input
              value={back}
              onChange={(e) => setBack(e.target.value)}
              placeholder="Answer"
              className="neon-focus text-sm"
            />
            <div className="mt-auto flex items-center justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setIsEditing(false);
                  setFront(question);
                  setBack(answer);
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
          >
            <Flashcard question={front} answer={back} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action buttons — visible on hover when not editing */}
      {!isEditing && (
        <div className="absolute right-2 top-2 z-20 flex gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
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
