'use client';

import { useCallback, useEffect, useRef } from 'react';

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type UseModalDialogOptions = {
  open: boolean;
  onClose: () => void;
  /**
   * Focused when the dialog opens. Defaults to the first focusable descendant.
   * Return null to leave focus where the browser put it.
   */
  initialFocus?: (dialog: HTMLElement) => HTMLElement | null | undefined;
};

/**
 * The modal keyboard contract from §9, in one place: Escape closes, Tab is
 * trapped, and focus returns to whatever opened the dialog.
 *
 * The navigation layer has two dialogs — the command palette and the account
 * sheet — and they must behave identically. Sharing the behaviour is also the
 * only way "focus returns to the trigger" can be true for a dialog opened from
 * the rail *and* from the header, since the trigger differs by viewport.
 *
 * A dialog that leaks focus to the page behind its scrim is not modal.
 */
export function useModalDialog({ open, onClose, initialFocus }: UseModalDialogOptions) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  // Held in a ref so a caller need not memoise the selector, and synced in an
  // effect rather than during render.
  const initialFocusRef = useRef(initialFocus);
  useEffect(() => {
    initialFocusRef.current = initialFocus;
  });

  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement as HTMLElement | null;
      requestAnimationFrame(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;
        const target =
          initialFocusRef.current?.(dialog) ??
          dialog.querySelector<HTMLElement>(FOCUSABLE);
        target?.focus();
      });
      return;
    }

    // Restore only when we actually took focus, so a first render does not
    // steal it from whatever the page focused itself — and only to an element
    // that is still in the document. A trigger that unmounted while the dialog
    // was open (one dialog opening another) would otherwise send focus to
    // <body>, which is worse than leaving it alone.
    const trigger = triggerRef.current;
    triggerRef.current = null;
    if (trigger && trigger.isConnected && trigger !== document.body) {
      trigger.focus();
    }
  }, [open]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!open) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      // Focus outside the dialog (a stray programmatic focus, or the very
      // first Tab after a click) is pulled back in rather than allowed to
      // continue through the page behind the scrim.
      if (!dialogRef.current.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [open, onClose]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return dialogRef;
}
