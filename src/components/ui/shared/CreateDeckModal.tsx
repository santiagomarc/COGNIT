'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, Sparkles, X } from 'lucide-react';
import { createDeck } from '@/app/actions';
import { createDeckSchema } from '@/lib/schemas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

type CreateDeckModalProps = {
  totalDecks: number;
  totalCards: number;
};

export function CreateDeckModal({ totalDecks, totalCards }: CreateDeckModalProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }

    if (triggerRef.current) {
      triggerRef.current.focus();
    }
  }, [open]);

  async function handleSubmit(formData: FormData) {
    setFieldError(null);
    const title = (formData.get('title') as string).trim();

    const parsed = createDeckSchema.safeParse({ title, is_public: false });
    if (!parsed.success) {
      const msg = parsed.error.issues.find((e) => e.path.includes('title'))?.message;
      setFieldError(msg ?? 'Invalid input');
      return;
    }

    setIsLoading(true);
    const result = await createDeck(parsed.data);
    if (result?.error) {
      toast.error(typeof result.error === 'string' ? result.error : 'Failed to create deck');
    } else {
      toast.success('Deck created successfully');
      formRef.current?.reset();
      setFieldError(null);
      setOpen(false);
    }
    setIsLoading(false);
  }

  return (
    <div className="glass-card glow-border h-full rounded-2xl p-3">
      <div className="relative h-full overflow-hidden rounded-xl border border-primary/15 bg-card/35 p-3">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_0%_0%,color-mix(in_oklab,var(--primary)_16%,transparent),transparent_48%)]" />

        <AnimatePresence mode="wait" initial={false}>
          {!open ? (
            <motion.div
              key="quick-actions-face"
              initial={{ opacity: 0, rotateX: -6, y: 6 }}
              animate={{ opacity: 1, rotateX: 0, y: 0 }}
              exit={{ opacity: 0, rotateX: 6, y: -6 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="relative flex h-full flex-col justify-between gap-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Quick Actions</p>
                  <p className="mt-1 text-sm font-medium text-foreground">Keep momentum today</p>
                </div>
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
                  <Sparkles className="h-4 w-4" />
                </span>
              </div>

              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border border-primary/20 bg-card/80 px-2 py-1 text-foreground/85">
                  {totalDecks} deck{totalDecks !== 1 ? 's' : ''}
                </span>
                <span className="rounded-full border border-primary/20 bg-card/80 px-2 py-1 text-foreground/85">
                  {totalCards} total card{totalCards !== 1 ? 's' : ''}
                </span>
              </div>

              <div className="grid gap-2">
                <button
                  ref={triggerRef}
                  type="button"
                  onClick={() => setOpen(true)}
                  className="inline-flex h-15 w-full items-center justify-center gap-2 rounded-xl border border-primary/45 bg-card/120 px-4 text-sm font-semibold text-foreground shadow-none transition-all hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
                >
                  <Plus className="h-4 w-4" />
                  <span>Create New Deck</span>
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="create-deck-face"
              initial={{ opacity: 0, rotateX: 6, y: 6 }}
              animate={{ opacity: 1, rotateX: 0, y: 0 }}
              exit={{ opacity: 0, rotateX: -6, y: -6 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="relative flex h-full flex-col justify-between gap-3"
              role="dialog"
              aria-modal="false"
              aria-labelledby="create-deck-title"
              onKeyDown={(e) => {
                if (e.key === 'Escape' && !isLoading) {
                  setOpen(false);
                }
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 id="create-deck-title" className="text-sm font-semibold tracking-tight text-foreground">
                    Create New Deck
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">Name it and start adding cards.</p>
                </div>
                <button
                  type="button"
                  onClick={() => !isLoading && setOpen(false)}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                  aria-label="Close create deck form"
                  disabled={isLoading}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form ref={formRef} action={handleSubmit} className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="inline-deck-title">Deck Title</Label>
                  <Input
                    ref={inputRef}
                    id="inline-deck-title"
                    name="title"
                    placeholder="e.g. Automata Theory"
                    required
                    aria-invalid={!!fieldError}
                    aria-describedby={fieldError ? 'inline-title-error' : undefined}
                    onChange={() => fieldError && setFieldError(null)}
                  />
                  {fieldError && (
                    <p id="inline-title-error" className="text-xs text-destructive" role="alert">
                      {fieldError}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setOpen(false)}
                    disabled={isLoading}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" disabled={isLoading}>
                    {isLoading ? 'Creating...' : 'Create Deck'}
                  </Button>
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
