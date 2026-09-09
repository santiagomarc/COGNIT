'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, m, useReducedMotion } from 'framer-motion';
import { useRouter } from 'next/navigation';

import { createDeck } from '@/app/actions/deck';
import { createDeckSchema } from '@/lib/schemas';
import { DECK_TAG_OPTIONS } from '@/lib/deck-tags';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { motionTransitions } from '@/lib/motion-configs';
import { OPEN_CREATE_DECK_EVENT } from '@/lib/dashboard-events';
import { toast } from 'sonner';

/**
 * Create a deck (design system §7.8).
 *
 * This used to be a *tile* that flipped between a "quick actions" face and a
 * form, wedged into the lower cell of a `grid-rows-[7fr_5fr]` stats column —
 * five-twelfths of a third of the dashboard for the most important entry point
 * a new user has (defect F-06). It is a real dialog now, opened from a button
 * in the due-now band, and the tile is gone.
 *
 * The `OPEN_CREATE_DECK_EVENT` listener is kept: the onboarding panel lives in
 * a different part of the tree and still asks for this by name.
 */
export function CreateDeckModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [accentTag, setAccentTag] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const handleOpenRequest = () => setOpen(true);
    window.addEventListener(OPEN_CREATE_DECK_EVENT, handleOpenRequest);
    return () => window.removeEventListener(OPEN_CREATE_DECK_EVENT, handleOpenRequest);
  }, []);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }

    triggerRef.current?.focus();
  }, [open]);

  // Escape closes; Tab is trapped inside the dialog (§9 — a modal that leaks
  // focus to the page behind it is not modal).
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!open) return;

      if (event.key === 'Escape') {
        if (!isLoading) setOpen(false);
        return;
      }

      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [isLoading, open]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  async function handleSubmit() {
    setFieldError(null);
    const title = draftTitle.trim();

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

    const submittedTitle = title;
    setOpen(false);
    setIsLoading(true);
    try {
      const result = await createDeck(parsed.data);
      if (result?.error) {
        setDraftTitle(submittedTitle);
        setOpen(true);
        toast.error(typeof result.error === 'string' ? result.error : 'Failed to create deck');
      } else {
        toast.success('Deck created successfully');
        formRef.current?.reset();
        setDraftTitle('');
        setAccentTag('');
        setFieldError(null);
        if (result?.deckId) {
          router.push(`/dashboard/${result.deckId}`);
        }
      }
    } catch (err) {
      setDraftTitle(submittedTitle);
      setOpen(true);
      console.error('[CreateDeckModal] error creating deck:', err);
      toast.error('Unable to create deck right now. Please refresh the page and try again.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <Button ref={triggerRef} type="button" onClick={() => setOpen(true)} disabled={isLoading}>
        {isLoading ? 'Creating…' : 'New deck'}
      </Button>

      <AnimatePresence>
        {open ? (
          <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center">
            {/* The scrim (§7.8) — `--z-overlay`, and the 4px blur that modal
                scrims are the only permitted use of in the product. */}
            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={reduced ? { duration: 0 } : motionTransitions.panel}
              onClick={() => !isLoading && setOpen(false)}
              className="absolute inset-0 z-[var(--z-overlay)] bg-[color-mix(in_srgb,var(--bg)_80%,transparent)] backdrop-blur-[4px]"
            />

            <m.div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="create-deck-title"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={reduced ? { duration: 0 } : motionTransitions.panel}
              className="surface relative z-[var(--z-modal)] mx-4 w-full max-w-[480px] border-border-strong p-6"
            >
              <p className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
                New deck
              </p>
              <h2 id="create-deck-title" className="mt-2 text-base font-semibold tracking-[-.015em]">
                Name it and start adding cards
              </h2>

              <form ref={formRef} action={handleSubmit} className="mt-5 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="inline-deck-title">Deck title</Label>
                  <Input
                    ref={inputRef}
                    id="inline-deck-title"
                    name="title"
                    placeholder="e.g. Automata Theory"
                    required
                    value={draftTitle}
                    aria-invalid={!!fieldError}
                    aria-describedby={fieldError ? 'inline-title-error' : undefined}
                    onChange={(e) => {
                      setDraftTitle(e.target.value);
                      if (fieldError) setFieldError(null);
                    }}
                  />
                  {fieldError && (
                    <p id="inline-title-error" className="text-xs text-destructive" role="alert">
                      {fieldError}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="inline-deck-tag">Subject tag</Label>
                  <select
                    id="inline-deck-tag"
                    value={accentTag}
                    onChange={(event) => setAccentTag(event.target.value)}
                    className="h-[34px] w-full rounded-[var(--radius-control)] border border-[var(--border-control)] bg-transparent px-3 text-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                  >
                    <option value="">None</option>
                    {DECK_TAG_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={isLoading}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="primary" disabled={isLoading}>
                    {isLoading ? 'Creating…' : 'Create deck'}
                  </Button>
                </div>
              </form>
            </m.div>
          </div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
