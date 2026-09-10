'use client';

import { useEffect } from 'react';

import { Kbd } from '@/components/ui/Kbd';
import { requestOpenCreateDeck } from '@/lib/dashboard-events';

/**
 * Creating a deck, as its own container rather than a button in a row
 * (Run 6, Task 2.3).
 *
 * It used to be one outlined button among three in the due-now band's action
 * cluster, which sized the single most important entry point for a new user
 * the same as "Import PDF". It is now the second-largest object on the screen
 * and sits at the end of the primary row.
 *
 * **It is deliberately not filled.** §7.2 allows at most one filled button per
 * screen and the dashboard's is "Start session". Prominence here comes from
 * container mass and position instead. If this is ever filled, that is a
 * documented exception to §7.2, not a drift.
 *
 * Its edge is --border-control rather than the decorative --border: the whole
 * panel is one operable control, and a control's bounds must clear 3:1
 * (WCAG 2.2 SC 1.4.11).
 */
export function CreateDeckPanel({ deckCount }: { deckCount: number }) {
  /*
   * ⌘N opens the same dialog the panel does. Bound here rather than drawn,
   * because a keycap the product does not honour is a lie — the same reason
   * the due-now band implements `S` rather than illustrating it (§7.3).
   */
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement ||
        (event.target instanceof HTMLElement && event.target.isContentEditable)
      ) {
        return;
      }

      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      if (event.key.toLowerCase() !== 'n') return;

      event.preventDefault();
      requestOpenCreateDeck();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <button
      type="button"
      onClick={requestOpenCreateDeck}
      aria-haspopup="dialog"
      aria-keyshortcuts="Meta+N Control+N"
      className="surface spec group flex w-full flex-col items-start border-[var(--border-control)] p-4 text-left transition-colors duration-[120ms] hover:bg-surface-raised lg:w-[340px] lg:p-5"
    >
      {/* A geometric plus drawn in CSS. §6's allowlist has a plus in it, but a
          14px stroke pair reads cleaner at this size than a 42px glyph and
          costs no import. */}
      <span className="relative grid size-[42px] shrink-0 place-items-center">
        <span aria-hidden="true" className="brk brk--tl" />
        <span aria-hidden="true" className="brk brk--tr" />
        <span aria-hidden="true" className="brk brk--bl" />
        <span aria-hidden="true" className="brk brk--br" />
        <span aria-hidden="true" className="relative block size-[17px]">
          <span className="absolute left-0 top-[8px] block h-[1.5px] w-[17px] bg-ink" />
          <span className="absolute left-[8px] top-0 block h-[17px] w-[1.5px] bg-ink" />
        </span>
      </span>

      <span className="mt-3.5 text-base font-semibold text-ink">Create deck</span>
      <span className="mt-1 text-[13px] leading-relaxed text-ink-dim">
        Start blank, paste notes, or generate cards from a PDF.
      </span>

      <span className="mt-auto flex w-full items-center justify-between pt-3">
        <span className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
          {deckCount === 1 ? '1 deck' : `${deckCount} decks`} so far
        </span>
        <Kbd>⌘N</Kbd>
      </span>
    </button>
  );
}
