'use client';

import { useState, useRef } from 'react';
import { createCard } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

type AddCardFormProps = {
  deckId: string;
};

export function AddCardForm({ deckId }: AddCardFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  async function handleSubmit(formData: FormData) {
    setIsLoading(true);

    const front = String(formData.get('front') ?? '');
    const back = String(formData.get('back') ?? '');

    const result = await createCard({
      deck_id: deckId,
      front,
      back,
    });

    if (result?.error) {
      toast.error(typeof result.error === 'string' ? result.error : 'Failed to create card');
    } else {
      toast.success('Card added to deck');
      formRef.current?.reset();
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
          <Input id="front" name="front" placeholder="e.g. What is closure in JavaScript?" required />
        </div>

        <div className="space-y-2">
          <Label htmlFor="back">Answer</Label>
          <Input id="back" name="back" placeholder="A function bundled with its lexical scope..." required />
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
