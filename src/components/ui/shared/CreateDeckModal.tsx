'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X } from 'lucide-react';
import { createDeck } from '@/app/actions';
import { createDeckSchema } from '@/lib/schemas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type CreateDeckModalProps = {
  triggerClassName?: string;
  triggerLabel?: string;
};

export function CreateDeckModal({ triggerClassName, triggerLabel = 'New Deck' }: CreateDeckModalProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  // Focus management
  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement as HTMLElement;
      requestAnimationFrame(() => {
        const input = dialogRef.current?.querySelector('input');
        input?.focus();
      });
    } else if (triggerRef.current) {
      triggerRef.current.focus();
      triggerRef.current = null;
    }
  }, [open]);

  // Escape to close + trap Tab
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === 'Escape') {
        if (!isLoading) setOpen(false);
        return;
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [open, isLoading]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

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
    <>
      <button
        onClick={() => setOpen(true)}
        className={cn('inline-flex items-center justify-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50', triggerClassName)}
      >
        <Plus className="h-4 w-4" />
        <span>{triggerLabel}</span>
      </button>

      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => !isLoading && setOpen(false)}
            />

            {/* Modal */}
            <motion.div
              ref={dialogRef}
              initial={{ opacity: 0, scale: 0.92, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 10 }}
              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              className="glass-card relative z-10 mx-4 w-full max-w-md max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl border border-primary/15 p-6 shadow-2xl"
              role="dialog"
              aria-modal="true"
              aria-labelledby="create-deck-title"
            >
              {/* Close button */}
              <button
                type="button"
                onClick={() => !isLoading && setOpen(false)}
                className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="mb-5 space-y-1">
                <h2 id="create-deck-title" className="text-lg font-semibold tracking-tight">
                  Create New Deck
                </h2>
                <p className="text-sm text-muted-foreground">
                  Start a new collection of flashcards.
                </p>
              </div>

              <form ref={formRef} action={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="modal-title">Deck Title</Label>
                  <Input
                    id="modal-title"
                    name="title"
                    placeholder="e.g. Automata Theory"
                    required
                    aria-invalid={!!fieldError}
                    aria-describedby={fieldError ? 'modal-title-error' : undefined}
                    onChange={() => fieldError && setFieldError(null)}
                  />
                  {fieldError && (
                    <p id="modal-title-error" className="text-xs text-destructive" role="alert">
                      {fieldError}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
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
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
