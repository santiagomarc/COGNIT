'use client';

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, m, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ShortcutsTable } from '@/components/ui/shared/ShortcutsTable';
import { OPEN_SHORTCUTS_EVENT } from '@/lib/dashboard-events';
import { isTypingTarget, pageShortcutBlocked } from '@/lib/hotkeys';
import { motionTransitions } from '@/lib/motion-configs';
import { isShortcutsHotkey } from '@/lib/shortcuts';
import { useModalDialog } from '@/lib/use-modal-dialog';

/**
 * The keyboard shortcuts, on `?` (sidebar plan §5.7, SET-06).
 *
 * Mounted once by the shell layout, beside CreateDeckModal, so it answers on
 * every chromed route. Focus routes (study, quiz, drills) have no chrome and
 * show their own bindings on their own controls (design system §7.3).
 *
 * `?` is ignored while typing and while any other dialog is open
 * (`pageShortcutBlocked`, KBD-01), and the command palette's "Keyboard
 * shortcuts" row opens it through OPEN_SHORTCUTS_EVENT.
 */
export function KeyboardShortcutsDialog() {
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion();
  const close = useCallback(() => setOpen(false), []);
  const dialogRef = useModalDialog({ open, onClose: close });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (pageShortcutBlocked(event) || isTypingTarget(event.target)) return;
      if (!isShortcutsHotkey(event)) return;
      event.preventDefault();
      setOpen(true);
    };
    const handleOpenRequest = () => setOpen(true);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener(OPEN_SHORTCUTS_EVENT, handleOpenRequest);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener(OPEN_SHORTCUTS_EVENT, handleOpenRequest);
    };
  }, []);

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center">
          {/* The scrim (§7.8): the one permitted blur. */}
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={reduced ? { duration: 0 } : motionTransitions.panel}
            onClick={close}
            className="absolute inset-0 z-[var(--z-overlay)] bg-[color-mix(in_srgb,var(--bg)_80%,transparent)] backdrop-blur-[4px]"
          />

          <m.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="shortcuts-title"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={reduced ? { duration: 0 } : motionTransitions.panel}
            className="panel relative z-[var(--z-modal)] mx-4 flex max-h-[min(640px,calc(100dvh-48px))] w-full max-w-[480px] flex-col"
          >
            <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
              <h2 id="shortcuts-title" className="text-base font-semibold tracking-[-.015em]">
                Keyboard shortcuts
              </h2>
              <Button type="button" size="icon-sm" variant="ghost" onClick={close} aria-label="Close">
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
            <ShortcutsTable className="overflow-y-auto px-5 py-4" />
          </m.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
