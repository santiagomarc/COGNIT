'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { rateSynthesisAttempt } from '@/app/actions/synthesis';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatActionError } from '@/lib/ai-feedback';

type CheckFeedbackProps = {
  deckId: string;
  attemptId: string;
};

const LABEL = 'font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer';

/**
 * "Was this check fair?" (audit F5) — the ongoing calibration signal the
 * one-time calibration set cannot give. Two ghost buttons; *Unfair* opens an
 * optional one-line note. One row per attempt, so a change of mind replaces.
 * A second "unfair" on the same drill retires it (plan §4.2, PED-05).
 */
export function CheckFeedback({ deckId, attemptId }: CheckFeedbackProps) {
  const [rating, setRating] = useState<'fair' | 'unfair' | null>(null);
  const [note, setNote] = useState('');
  const [noteSent, setNoteSent] = useState(false);
  const [retired, setRetired] = useState(false);
  const [isPending, startTransition] = useTransition();

  const send = (nextRating: 'fair' | 'unfair', nextNote?: string) => {
    startTransition(async () => {
      try {
        const result = await rateSynthesisAttempt({
          deck_id: deckId,
          attempt_id: attemptId,
          rating: nextRating,
          note: nextNote?.trim() ? nextNote.trim() : undefined,
        });
        if (result && 'error' in result && result.error) {
          toast.error(formatActionError(result.error, 'Could not save your feedback.'));
          return;
        }
        setRating(nextRating);
        if (nextNote !== undefined) setNoteSent(true);
        if (result && 'retired' in result && result.retired) setRetired(true);
      } catch {
        toast.error('Could not save your feedback. Check your connection and try again.');
      }
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className={LABEL}>{rating ? 'Thanks' : 'Was this check fair?'}</span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-pressed={rating === 'fair'}
        onClick={() => send('fair')}
        disabled={isPending}
        className="h-[24px] px-2 text-[12px]"
      >
        Fair
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-pressed={rating === 'unfair'}
        onClick={() => send('unfair')}
        disabled={isPending}
        className="h-[24px] px-2 text-[12px]"
      >
        Unfair
      </Button>
      {rating === 'unfair' && !noteSent ? (
        <form
          className="flex min-w-0 flex-1 items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            send('unfair', note);
          }}
        >
          <Input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="What did it get wrong? (optional)"
            maxLength={300}
            disabled={isPending}
            aria-label="What did the check get wrong?"
            className="h-[28px] min-w-0 flex-1 text-[12px] sm:text-[12px]"
          />
          <Button type="submit" variant="ghost" size="sm" disabled={isPending || note.trim().length === 0} className="h-[24px] px-2 text-[12px]">
            Send
          </Button>
        </form>
      ) : null}
      {retired ? (
        <p role="status" className="w-full text-[13px] text-ink-dim">
          Thanks — this drill has been retired, so it will not come up again.
        </p>
      ) : null}
    </div>
  );
}
