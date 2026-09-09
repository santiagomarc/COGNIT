'use client';

import { useState } from 'react';
import { getHint } from '@/app/actions/ai-assist';
import { Button } from '@/components/ui/button';
import { formatActionError } from '@/lib/ai-feedback';
import { toast } from 'sonner';

type HintButtonProps = {
  cardId: string;
  deckId: string;
  disabled?: boolean;
};

export function HintButton({ cardId, deckId, disabled = false }: HintButtonProps) {
  const [hint, setHint] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleClick() {
    if (hint) {
      setHint(null);
      return;
    }

    setIsLoading(true);
    const result = await getHint({ card_id: cardId, deck_id: deckId });
    setIsLoading(false);

    if (result?.error) {
      toast.error(formatActionError(result.error, 'Hint generation failed'));
      return;
    }

    if (result?.success && result.hint) {
      setHint(result.hint);
    }
  }

  return (
    <div className="space-y-2">
      {/* §1.1 bans the lightbulb, and §6 answers what to put in its place:
          nothing. The word "hint" is the affordance; a bulb beside it was
          restating the label in a metaphor. */}
      <Button
        type="button"
        size="sm"
        onClick={handleClick}
        disabled={disabled || isLoading}
        aria-expanded={hint !== null}
      >
        {isLoading ? 'Thinking…' : hint ? 'Hide hint' : 'Get a hint'}
      </Button>
      <p className="max-w-sm text-xs text-muted-foreground">
        The hint is AI-generated from the card&apos;s answer and description, and it tries not to reveal the term directly.
      </p>
      {hint ? (
        <div className="rounded-[var(--radius-container)] border border-border px-3 py-2 text-sm text-muted-foreground">
          {hint}
        </div>
      ) : null}
    </div>
  );
}