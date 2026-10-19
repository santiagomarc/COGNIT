'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { whenIdle } from '@/lib/when-idle';

const loadAddCardForm = () => import('@/components/ui/shared/AddCardForm');
const loadBulkImport = () => import('@/components/ui/shared/BulkImportModal');
const loadPdfUpload = () => import('@/components/ui/shared/PDFUploadZone');

const AddCardForm = dynamic(() => loadAddCardForm().then((mod) => mod.AddCardForm));
const BulkImportModal = dynamic(() => loadBulkImport().then((mod) => mod.BulkImportModal));
const PDFUploadZone = dynamic(() => loadPdfUpload().then((mod) => mod.PDFUploadZone));

/**
 * The inside of AddContentPanel's `<details>`, mounted once the panel is first
 * opened (performance plan PERF-13). The card form, bulk import and PDF upload
 * used to load with every deck page, though the panel is closed on every deck
 * that has cards. An empty deck's panel starts open, so its content renders on
 * the server as before. Their code is prefetched once the browser is idle, so
 * opening the panel doesn't wait on the network.
 */
export function AddContentBody({ deckId, hasCards }: { deckId: string; hasCards: boolean }) {
  const [opened, setOpened] = useState(!hasCards);
  const anchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const details = anchorRef.current?.closest('details');
    if (!details) return;

    // Fires for a click on the summary and for a script or a `#add-content`
    // link opening it. Once mounted it stays mounted, keeping half-typed input.
    const onToggle = () => {
      if (details.open) setOpened(true);
    };
    details.addEventListener('toggle', onToggle);
    const cancelIdle = whenIdle(() => {
      void loadAddCardForm();
      void loadBulkImport();
      void loadPdfUpload();
    });

    return () => {
      details.removeEventListener('toggle', onToggle);
      cancelIdle();
    };
  }, []);

  return (
    <div ref={anchorRef}>
      {opened ? (
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
      ) : null}
    </div>
  );
}
