'use client';

import { useState } from 'react';
import { Lightbulb } from 'lucide-react';
import { getHint } from '@/app/actions';
import { Button } from '@/components/ui/button';
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
      toast.error(typeof result.error === 'string' ? result.error : 'Hint generation failed');
      return;
    }

    if (result?.success && result.hint) {
      setHint(result.hint);
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" size="sm" onClick={handleClick} disabled={disabled || isLoading} className="gap-2">
        <Lightbulb className="h-4 w-4" />
        {isLoading ? 'Thinking...' : hint ? 'Hide Hint' : 'Get AI Hint'}
      </Button>
      <p className="max-w-sm text-xs text-muted-foreground">
        The hint is AI-generated from the card&apos;s answer and description, and it tries not to reveal the term directly.
      </p>
      {hint ? (
        <div className="rounded-xl border border-primary/15 bg-card/30 px-3 py-2 text-sm text-muted-foreground">
          {hint}
        </div>
      ) : null}
    </div>
  );
}