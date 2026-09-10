'use client';

import { useEffect } from 'react';

/**
 * `R` starts a review on the deck page (design system §7.3).
 *
 * The launcher renders a `<Kbd>R</Kbd>` beside its submit button, and a keycap
 * the product does not honour is a lie — the same reason the due-now band
 * implements `S` rather than illustrating it. So the binding lives here, as the
 * one client island in an otherwise server-rendered launcher, and it submits
 * the real form rather than navigating to a URL the form would have built
 * differently.
 */
export function DeckReviewHotkey({ formId, enabled }: { formId: string; enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement ||
        (event.target instanceof HTMLElement && event.target.isContentEditable)
      ) {
        return;
      }

      // Never steal a browser or OS chord.
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key.toLowerCase() !== 'r') return;

      const form = document.getElementById(formId);
      if (!(form instanceof HTMLFormElement)) return;

      event.preventDefault();
      form.requestSubmit();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [formId, enabled]);

  return null;
}
