'use client';

import { useState, useRef } from 'react';
import { createDeck } from '@/app/actions/deck';
import { createDeckSchema } from '@/lib/schemas';
import { DECK_TAG_OPTIONS } from '@/lib/deck-tags';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export function CreateDeckForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  async function handleSubmit(formData: FormData) {
    setFieldError(null);
    const title = (formData.get('title') as string).trim();
    const accentTag = (formData.get('accent_tag') as string | null)?.trim() ?? '';

    // Client-side validation
    const parsed = createDeckSchema.safeParse({
      title,
      accent_tag: accentTag || undefined,
      is_public: false,
    });
    if (!parsed.success) {
      const msg = parsed.error.issues.find((e) => e.path.includes('title'))?.message;
      setFieldError(msg ?? 'Invalid input');
      return;
    }

    setIsLoading(true);
    try {
      const result = await createDeck(parsed.data);
      if (result?.error) {
        toast.error(typeof result.error === 'string' ? result.error : 'Failed to create deck');
      } else {
        toast.success('Deck created successfully');
        formRef.current?.reset();
        setFieldError(null);
      }
    } catch (err) {
      console.error('[CreateDeckForm] error creating deck:', err);
      toast.error('Unable to create deck right now. Please refresh the page and try again.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form ref={formRef} action={handleSubmit} className="glass-card glow-border flex flex-col gap-4 p-5 rounded-2xl text-card-foreground max-w-md">
      <div className="space-y-1">
        <h3 className="text-lg font-semibold tracking-tight">Create New Deck</h3>
        <p className="text-sm text-muted-foreground">Start a new collection of flashcards.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="title">Deck Title</Label>
        <Input
          id="title"
          name="title"
          placeholder="e.g. Automata Theory"
          required
          aria-invalid={!!fieldError}
          aria-describedby={fieldError ? 'title-error' : undefined}
          onChange={() => fieldError && setFieldError(null)}
        />
        {fieldError && (
          <p id="title-error" className="text-xs text-destructive" role="alert">
            {fieldError}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="accent_tag">Accent Tag</Label>
        <select
          id="accent_tag"
          name="accent_tag"
          className="neon-focus h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          defaultValue=""
        >
          <option value="">None</option>
          {DECK_TAG_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <Button type="submit" disabled={isLoading}>
        {isLoading ? 'Creating...' : 'Create Deck'}
      </Button>
    </form>
  );
}