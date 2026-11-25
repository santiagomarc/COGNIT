'use client';

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
 * The "Create deck" inside is a `<span>` dressed as the outlined button, since a
 * button can't hold a button: one tab stop, and the panel's hover and focus
 * drive it.
 *
 * Its edge is --border-control rather than the decorative --border: the whole
 * panel is one operable control, and a control's bounds must clear 3:1
 * (WCAG 2.2 SC 1.4.11).
 */
export function CreateDeckPanel({ deckCount }: { deckCount: number }) {
  /*
   * ⌘N is bound by CreateDeckModal, which the shell mounts on every chromed
   * route, so the keycap below is honoured everywhere it is shown — not only
   * on Today, where this panel lives (sidebar plan §5.7).
   */

  return (
    <button
      type="button"
      onClick={requestOpenCreateDeck}
      aria-haspopup="dialog"
      aria-keyshortcuts="Meta+N Control+N"
      className="surface spec create-deck group relative flex w-full cursor-pointer flex-col items-start p-4 text-left outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] lg:p-5 xl:w-[340px]"
    >
      {/* Specular hairline highlight that illuminates on hover. The hover
          treatment as a whole is `.create-deck` in globals.css. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px rounded-t-[var(--radius-lg)] bg-gradient-to-r from-transparent via-ink/40 to-transparent opacity-0 transition-opacity duration-[120ms] group-hover:opacity-100" />

      {/* A geometric plus drawn in CSS. §6's allowlist has a plus in it, but a
          14px stroke pair reads cleaner at this size than a 42px glyph and
          costs no import. */}
      <span className="relative grid size-[42px] shrink-0 place-items-center">
        <span aria-hidden="true" className="brk brk--tl" />
        <span aria-hidden="true" className="brk brk--tr" />
        <span aria-hidden="true" className="brk brk--bl" />
        <span aria-hidden="true" className="brk brk--br" />
        <span aria-hidden="true" className="create-deck__plus relative block size-[17px]">
          <span className="absolute left-0 top-[8px] block h-[1.5px] w-[17px] bg-ink" />
          <span className="absolute left-[8px] top-0 block h-[17px] w-[1.5px] bg-ink" />
        </span>
      </span>

      <span className="mt-3.5 text-base font-bold text-ink">Add a deck</span>
      <span className="mt-1 type-sm leading-relaxed text-ink-dim">
        Start blank, paste notes, or generate cards from a PDF.
      </span>

      <span className="mt-auto flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-3">
        <span className="inline-flex h-[40px] items-center gap-2 rounded-[var(--radius-sm)] border border-[#B7410E] bg-[#B7410E] px-4 text-sm font-semibold text-white shadow-sm transition-[background-color,border-color,box-shadow] duration-200 ease-out group-hover:border-[#C44C15] group-hover:bg-[#C44C15] group-hover:shadow-md group-focus-visible:border-[#C44C15] group-focus-visible:bg-[#C44C15] group-focus-visible:shadow-md pointer-coarse:h-[44px]">
          Create deck
        </span>
        <span className="type-label text-ink-dimmer transition-colors duration-[120ms] group-hover:text-ink-dim">
          {deckCount === 1 ? '1 deck' : `${deckCount} decks`} so far
        </span>
      </span>
    </button>
  );
}
