'use client';

import { useState, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createCard, enrichCards } from '@/app/actions';
import { formatActionError } from '@/lib/ai-feedback';
import { createCardSchema } from '@/lib/schemas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

type AddCardFormProps = {
  deckId: string;
};

export function AddCardForm({ deckId }: AddCardFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [, startEnrichmentTransition] = useTransition();
  const [errors, setErrors] = useState<{ front?: string; back?: string }>({});
  const formRef = useRef<HTMLFormElement>(null);

  function clearError(field: 'front' | 'back') {
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  async function handleSubmit(formData: FormData) {
    setErrors({});
    const front = String(formData.get('front') ?? '').trim();
    const back = String(formData.get('back') ?? '').trim();

    // Client-side validation
    const parsed = createCardSchema.safeParse({ deck_id: deckId, front, back });
    if (!parsed.success) {
      const fieldErrors: { front?: string; back?: string } = {};
      for (const err of parsed.error.issues) {
        const key = err.path[0] as string;
        if (key === 'front' || key === 'back') fieldErrors[key] = err.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setIsLoading(true);
    const result = await createCard(parsed.data);

    if (result?.error) {
      toast.error(typeof result.error === 'string' ? result.error : 'Failed to create card');
    } else {
      toast.success('Card added to deck');
      formRef.current?.reset();
      setErrors({});
      router.refresh();
      if (result.cardId) {
        startEnrichmentTransition(async () => {
          const enrichmentResult = await enrichCards({ deck_id: deckId, card_ids: [result.cardId] });
          if (enrichmentResult?.error) {
            toast(formatActionError(enrichmentResult.error, 'Quiz enhancement will be prepared later.'));
          }
        });
      }
    }

    setIsLoading(false);
  }

  return (
    <form ref={formRef} action={handleSubmit} className="glass-card glow-border rounded-2xl p-5 text-card-foreground">
      <div className="mb-4 space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Add Card</h2>
        <p className="text-sm text-muted-foreground">Create a new flashcard for this deck.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="front">Question</Label>
          <Input
            id="front"
            name="front"
            placeholder="e.g. What is closure in JavaScript?"
            required
            aria-invalid={!!errors.front}
            aria-describedby={errors.front ? 'front-error' : undefined}
            onChange={() => clearError('front')}
          />
          {errors.front && (
            <p id="front-error" className="text-xs text-destructive" role="alert">
              {errors.front}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="back">Answer</Label>
          <Textarea
            id="back"
            name="back"
            placeholder="A function bundled with its lexical scope..."
            required
            aria-invalid={!!errors.back}
            aria-describedby={errors.back ? 'back-error' : undefined}
            onChange={() => clearError('back')}
          />
          {errors.back && (
            <p id="back-error" className="text-xs text-destructive" role="alert">
              {errors.back}
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-end">
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Adding...' : 'Add Card'}
        </Button>
      </div>
    </form>
  );
}
