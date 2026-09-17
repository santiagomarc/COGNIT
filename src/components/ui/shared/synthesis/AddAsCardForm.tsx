'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { absorbOutsideClaim } from '@/app/actions/synthesis';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { formatActionError } from '@/lib/ai-feedback';
import type { OutsideClaim } from '@/lib/synthesis/types';

type AddAsCardFormProps = {
  deckId: string;
  claim: OutsideClaim;
  /** The attempt the claim was made in and its position in that attempt's outside claims. */
  attemptId: string;
  claimIndex: number;
  /** Set when this claim already became a card (survives a reload, a replay, a revision). */
  absorbedCardId?: string | null;
};

/**
 * "+ Add as card" (spec §3.1 point 4): lecture knowledge the deck did not
 * cover enters the deck in one tap. Term is prefilled from the model's
 * `term_suggestion`, Description from its `ai_assessment`. `front` is the
 * term and `back` the description in this schema (design system §7.6).
 *
 * Three states: the offer, the form, and the absorbed card with a link to
 * review it — the absorbed state is server-known (improvement plan §3.3), so
 * a reload does not offer the same claim twice.
 */
export function AddAsCardForm({ deckId, claim, attemptId, claimIndex, absorbedCardId = null }: AddAsCardFormProps) {
  const [open, setOpen] = useState(false);
  const [addedCardId, setAddedCardId] = useState<string | null>(absorbedCardId);
  const [term, setTerm] = useState(claim.termSuggestion);
  const [description, setDescription] = useState(claim.aiAssessment);
  const [isPending, startTransition] = useTransition();

  if (addedCardId) {
    return (
      <span className="inline-flex flex-wrap items-baseline gap-x-2 font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
        Added to deck
        <Link
          href={`/dashboard/${deckId}/study?cards=${addedCardId}`}
          className="rounded-[var(--radius-sm)] text-ink underline underline-offset-[3px] outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          Review card →
        </Link>
      </span>
    );
  }

  if (!open) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        + Add as card
      </Button>
    );
  }

  const submit = () => {
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof absorbOutsideClaim>>;
      try {
        result = await absorbOutsideClaim({
          deck_id: deckId,
          attempt_id: attemptId,
          claim_index: claimIndex,
          front: term.trim(),
          back: description.trim(),
        });
      } catch {
        toast.error('Could not add the card. Check your connection and try again.');
        return;
      }
      if ('error' in result && result.error) {
        toast.error(formatActionError(result.error, 'Failed to add the card.'));
        return;
      }
      if (!('success' in result) || !result.success) {
        toast.error('Failed to add the card.');
        return;
      }
      toast.success(result.duplicate ? 'That claim is already a card' : 'Card added — quiz-ready in a moment');
      setAddedCardId(result.cardId ?? null);
    });
  };

  return (
    <form
      className="mt-2 flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <label className="flex flex-col gap-1">
        <span className="slot-label">Term</span>
        <Input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          maxLength={1000}
          required
          disabled={isPending}
          className="h-[36px] sm:text-[13px]"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="slot-label">Description</span>
        <Textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={2000}
          required
          rows={2}
          disabled={isPending}
          className="min-h-[3rem] sm:text-[13px]"
        />
      </label>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={isPending || term.trim().length === 0 || description.trim().length === 0}>
          {isPending ? 'Adding…' : 'Add card'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={isPending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
