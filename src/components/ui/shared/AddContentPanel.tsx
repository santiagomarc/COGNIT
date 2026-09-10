import { AddCardForm } from '@/components/ui/shared/AddCardForm';
import { BulkImportModal } from '@/components/ui/shared/BulkImportModal';
import { PDFUploadZone } from '@/components/ui/shared/PDFUploadZone';

/**
 * All three ingestion surfaces, behind one disclosure (Run 6, Task 3.2).
 *
 * `AddCardForm`, `PDFUploadZone` and `BulkImportModal` used to be three
 * `.surface` blocks stacked in the page's single column, at the same visual
 * weight as the card list and the study launcher. Nothing here is deleted —
 * adding content is genuinely important — but it is *episodic*: a user opens a
 * deck to study it far more often than to feed it. Episodic work belongs behind
 * a disclosure, not in the permanent composition.
 *
 * A native `<details>`, so it costs no JavaScript, is keyboard-operable and
 * screen-reader-announced for free, and survives with JS disabled.
 */
export function AddContentPanel({ deckId, hasCards }: { deckId: string; hasCards: boolean }) {
  return (
    <details
      id="add-content"
      className="surface group scroll-mt-24 border-dashed border-[var(--border-strong)] open:border-solid"
      open={!hasCards}
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="relative block size-[15px] shrink-0">
          <span className="absolute left-0 top-[7px] block h-[1.5px] w-[15px] bg-ink-dim" />
          <span className="absolute left-[7px] top-0 block h-[15px] w-[1.5px] bg-ink-dim transition-transform duration-[120ms] group-open:rotate-90" />
        </span>
        <span className="text-sm font-medium text-ink">
          {hasCards ? 'Add content' : 'Start here — this deck is empty'}
        </span>
        <span className="truncate text-[13px] text-ink-dimmer max-sm:hidden">
          Write a card · paste notes · generate from a PDF
        </span>
        <span
          aria-hidden="true"
          className="ml-auto shrink-0 text-ink-dimmer transition-transform duration-[120ms] group-open:rotate-180"
        >
          ⌄
        </span>
      </summary>

      <div className="flex flex-col gap-4 border-t border-border p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <p className="max-w-[62ch] text-sm text-ink-dim">
            {hasCards
              ? 'Add individual cards, bulk-import structured notes, or generate cards from a PDF.'
              : 'Add cards, bulk-import notes, or generate from a PDF to unlock study and quiz modes.'}
          </p>
          <BulkImportModal deckId={deckId} />
        </div>

        <AddCardForm deckId={deckId} />
        <PDFUploadZone deckId={deckId} />
      </div>
    </details>
  );
}
