'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { createCard } from '@/app/actions/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { formatActionError } from '@/lib/ai-feedback';
import type { OutsideClaim } from '@/lib/synthesis/types';

type AddAsCardFormProps = {
  deckId: string;
  claim: OutsideClaim;
};

/**
 * "+ Add as card" (spec §3.1 point 4): lecture knowledge the deck did not
 * cover enters the deck in one tap. Term is prefilled from the model's
 * `term_suggestion`, Description from its `ai_assessment`. `front` is the
 * term and `back` the description in this schema (design system §7.6).
 */
export function AddAsCardForm({ deckId, claim }: AddAsCardFormProps) {
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState(false);
  const [term, setTerm] = useState(claim.termSuggestion);
  const [description, setDescription] = useState(claim.aiAssessment);
  const [isPending, startTransition] = useTransition();

  if (added) {
    return (
      <span className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
        Added to deck
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
      const result = await createCard({ deck_id: deckId, front: term.trim(), back: description.trim() });
      if (result && 'error' in result && result.error) {
        toast.error(formatActionError(result.error, 'Failed to add the card.'));
        return;
      }
      toast.success('Card added to deck');
      setAdded(true);
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
          className="h-[36px] text-[13px] sm:text-[13px]"
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
          className="min-h-[3rem] text-[13px]"
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
