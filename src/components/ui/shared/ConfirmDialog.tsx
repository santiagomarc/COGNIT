'use client';

import { m, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useEffect, useRef, useCallback } from 'react';
import { motionTransitions } from '@/lib/motion-configs';

type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'destructive' | 'default';
  loading?: boolean;
  onConfirm: () => void;
};

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  loading = false,
  onConfirm,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const reduced = useReducedMotion();

  // Capture the trigger element on open, auto-focus cancel, restore focus on close
  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement as HTMLElement;
      // Small delay for the animation to render the dialog
      requestAnimationFrame(() => {
        cancelRef.current?.focus();
      });
    } else if (triggerRef.current) {
      triggerRef.current.focus();
      triggerRef.current = null;
    }
  }, [open]);

  // Close on Escape + trap Tab inside the dialog
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!open) return;

      if (e.key === 'Escape') {
        if (!loading) onOpenChange(false);
        return;
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    },
    [open, loading, onOpenChange]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center">
          {/* The scrim (§7.8): the page's own ground at 80%, and the 4px blur
              that modal scrims are the only permitted use of. `bg-black/50`
              was a hard-coded colour that read as a hole in light mode. */}
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={reduced ? { duration: 0 } : motionTransitions.panel}
            className="absolute inset-0 z-[var(--z-overlay)] bg-[color-mix(in_srgb,var(--bg)_80%,transparent)] backdrop-blur-[4px]"
            onClick={() => !loading && onOpenChange(false)}
          />

          <m.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={reduced ? { duration: 0 } : motionTransitions.panel}
            ref={dialogRef}
            className="surface relative z-[var(--z-modal)] mx-4 max-h-[calc(100vh-2rem)] w-full max-w-[480px] overflow-y-auto border-border-strong p-6"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-desc"
          >
            <div className="flex items-start gap-3">
              {/*
                A 2px state tick instead of a glyph in a tinted square (§7.5).
                A destructive confirmation is the one dialog whose stakes are
                worth a hue, and the word in the button already says which one
                it is — the colour is never carrying it alone.
              */}
              <span
                aria-hidden="true"
                className="mt-1 h-4 w-[2px] shrink-0 rounded-[1px]"
                style={{
                  backgroundColor:
                    variant === 'destructive' ? 'var(--state-lapsed)' : 'var(--ink-dim)',
                }}
              />
              <div className="space-y-1.5">
                <h3 id="confirm-title" className="text-base font-semibold tracking-[-.015em]">
                  {title}
                </h3>
                {description && (
                  <p id="confirm-desc" className="text-sm leading-relaxed text-muted-foreground">
                    {description}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <Button
                ref={cancelRef}
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                {cancelLabel}
              </Button>
              <Button
                variant={variant === 'destructive' ? 'destructive' : 'primary'}
                size="sm"
                onClick={onConfirm}
                disabled={loading}
              >
                {loading ? 'Processing…' : confirmLabel}
              </Button>
            </div>
          </m.div>
        </div>
      )}
    </AnimatePresence>
  );
}
