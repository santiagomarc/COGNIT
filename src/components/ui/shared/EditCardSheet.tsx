'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { updateCard, deleteCard } from '@/app/actions/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useModalDialog } from '@/lib/use-modal-dialog';

type EditCardSheetProps = {
  deckId: string;
  cardId: string;
  /** What the user is asked. Stored in `back`. */
  question: string;
  /** What the user is trying to recall. Stored in `front`. */
  answer: string;
  onClose: () => void;
  onSaved: (next: { question: string; answer: string }) => void;
  onDeleted: () => void;
};

/**
 * Fix a card without leaving the study session (UIUX plan §5.8, FLOW-02).
 * Loaded on first use, so the study route stays inside its bundle budget.
 *
 * Naming trap: in this schema `front` is the answer and `back` is the
 * question. The sheet speaks Question/Answer and maps at the boundary below.
 */
export function EditCardSheet({ deckId, cardId, question, answer, onClose, onSaved, onDeleted }: EditCardSheetProps) {
  const [questionText, setQuestionText] = useState(question);
  const [answerText, setAnswerText] = useState(answer);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const dialogRef = useModalDialog({ open: true, onClose });

  const canSave = questionText.trim().length > 0 && answerText.trim().length > 0 && !busy;

  const save = useCallback(async () => {
    if (!canSave) return;
    setBusy(true);
    const result = await updateCard({
      id: cardId,
      deck_id: deckId,
      back: questionText.trim(),
      front: answerText.trim(),
    });
    setBusy(false);

    if (result && 'error' in result) {
      toast.error(typeof result.error === 'string' ? result.error : 'Failed to update card');
      return;
    }
    toast.success('Card updated');
    onSaved({ question: questionText.trim(), answer: answerText.trim() });
  }, [answerText, canSave, cardId, deckId, onSaved, questionText]);

  const remove = useCallback(async () => {
    setBusy(true);
    const result = await deleteCard(cardId, deckId);
    setBusy(false);

    if (result && 'error' in result) {
      toast.error(typeof result.error === 'string' ? result.error : 'Failed to delete card');
      setConfirmingDelete(false);
      return;
    }
    toast.success('Card deleted');
    onDeleted();
  }, [cardId, deckId, onDeleted]);

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center">
      {/* The scrim (§7.8): the one permitted blur. */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-[color-mix(in_srgb,var(--bg)_80%,transparent)] backdrop-blur-[4px]"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-card-title"
        className="panel relative mx-4 flex max-h-[calc(100dvh-48px)] w-full max-w-lg flex-col gap-4 overflow-y-auto p-5"
      >
        <h2 id="edit-card-title" className="text-base font-semibold tracking-[-.015em]">
          Edit card
        </h2>

        <label className="flex flex-col gap-1.5">
          <span className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">Question</span>
          <Textarea
            value={questionText}
            onChange={(event) => setQuestionText(event.target.value)}
            rows={4}
            className="resize-none leading-relaxed sm:text-sm"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">Answer</span>
          <Textarea
            value={answerText}
            onChange={(event) => setAnswerText(event.target.value)}
            rows={3}
            className="resize-none leading-relaxed sm:text-sm"
          />
        </label>

        <div className="flex flex-wrap items-center justify-between gap-3">
          {confirmingDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-ink-dim">Delete this card for good?</span>
              <Button type="button" size="sm" variant="destructive" onClick={remove} disabled={busy}>
                Delete
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmingDelete(false)} disabled={busy}>
                Keep
              </Button>
            </div>
          ) : (
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmingDelete(true)} disabled={busy}>
              Delete card
            </Button>
          )}

          <div className="ml-auto flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="button" variant="primary" onClick={save} disabled={!canSave}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
