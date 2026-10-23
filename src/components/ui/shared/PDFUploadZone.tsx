'use client';

import { useState, useRef, useCallback, useEffect, type DragEvent, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ElapsedTelemetry } from '@/components/ui/shared/ElapsedTelemetry';
import { motionTransitions } from '@/lib/motion-configs';
import { usePdfGeneration, type GenerationOutcome } from '@/lib/use-pdf-generation';
import { toast } from 'sonner';
import { m, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Upload, X } from 'lucide-react';

type PDFUploadZoneProps = {
  deckId: string;
};

const PDF_GENERATION_MAX_COUNT = 30;

// Must stay in sync with MAX_PDF_BYTES in lib/pdf-generation.ts. Rejecting
// oversized files here saves uploading a body the server will refuse.
const MAX_PDF_BYTES = 10 * 1024 * 1024;

function getFileRejectionReason(file: File) {
  if (file.type !== 'application/pdf') {
    return 'Only PDF files are supported.';
  }

  if (file.size > MAX_PDF_BYTES) {
    const sizeMb = (file.size / 1024 / 1024).toFixed(1);
    return `That PDF is ${sizeMb} MB. Please upload a file under 10 MB.`;
  }

  return null;
}

export function PDFUploadZone({ deckId }: PDFUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [maxCardChoice, setMaxCardChoice] = useState<string>('10');
  const [startedAt, setStartedAt] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const reduced = useReducedMotion();
  const router = useRouter();
  const generation = usePdfGeneration();
  const { running: isGenerating, cards: generatedCards, clear: clearGenerated } = generation;

  const resolvedMaxCardCount = maxCardChoice === 'max' ? PDF_GENERATION_MAX_COUNT : Number(maxCardChoice);

  // Closing the tab stops the run (the cards shown so far stay saved);
  // leaving for another page in the app does not (FLOW-06).
  useEffect(() => {
    if (!isGenerating) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isGenerating]);

  // ── Drag handlers ──
  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set false when leaving the zone itself (not child elements)
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (!file) {
      toast.error('Please drop a PDF file.');
      return;
    }

    const rejection = getFileRejectionReason(file);
    if (rejection) {
      toast.error(rejection);
      return;
    }

    setSelectedFile(file);
    clearGenerated();
  }, [clearGenerated]);

  const handleFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const rejection = getFileRejectionReason(file);
    if (rejection) {
      toast.error(rejection);
      e.target.value = '';
      return;
    }

    setSelectedFile(file);
    clearGenerated();
  }, [clearGenerated]);

  const clearFile = useCallback(() => {
    setSelectedFile(null);
    clearGenerated();
    if (inputRef.current) inputRef.current.value = '';
  }, [clearGenerated]);

  // ── Generate ──
  async function handleGenerate() {
    if (!selectedFile) return;

    setStartedAt(Date.now());
    const outcome = await generation.generate({ file: selectedFile, deckId, count: maxCardChoice });
    reportOutcome(outcome, resolvedMaxCardCount);

    if (outcome.saved > 0) {
      setSelectedFile(null);
      if (inputRef.current) inputRef.current.value = '';
      // The deck's card list and counts; also clears the router's cached
      // pages, which a route handler (unlike a Server Action) can't purge.
      router.refresh();
    }
  }

  return (
    <div className="space-y-4">
      {/* ─── Drop zone ─── */}
      <div className="surface relative p-5">
        <div className="mb-4 space-y-1">
          <h2 className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
            Generate from PDF
          </h2>
          <p className="text-sm text-ink-dim">
            Upload lecture slides, a chapter or your own notes. Cards are written from the text and
            saved to this deck.
          </p>
        </div>

        <div
          role="button"
          tabIndex={0}
          aria-label="Drop a PDF file here or click to browse"
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
          }}
          className={`flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-[var(--radius-container)] border border-dashed p-6 text-center transition-colors outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
            isDragging || selectedFile
              ? 'border-[var(--accent)] bg-surface-raised'
              : 'border-[var(--border-control)] hover:bg-surface-raised'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            onChange={handleFileChange}
            className="hidden"
            aria-hidden="true"
          />

          {selectedFile ? (
            <div className="flex flex-col items-center gap-2">
              <p className="text-sm font-medium">{selectedFile.name}</p>
              <p className="font-mono text-[13px] tnum text-ink-dim">
                {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  clearFile();
                }}
                className="mt-1 inline-flex items-center gap-1 rounded-[var(--radius-xs)] text-xs text-ink-dimmer transition-colors hover:text-ink"
              >
                <X className="h-3 w-3" />
                Remove
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload className="h-5 w-5 text-ink-dimmer" />
              <p className="text-sm font-medium">
                {isDragging ? 'Drop your PDF here' : 'Drag a PDF here, or click to browse'}
              </p>
              <p className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
                PDF · max 10 MB
              </p>
            </div>
          )}
        </div>

        {selectedFile && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <label
                htmlFor="card-count"
                className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer"
              >
                Max cards
              </label>
              <select
                id="card-count"
                value={maxCardChoice}
                onChange={(e) => setMaxCardChoice(e.target.value)}
                className="h-[32px] rounded-[var(--radius-sm)] border border-[var(--border-control)] bg-surface px-2 text-base sm:text-sm outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                {[5, 10, 15, 20, 25].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
                <option value="max">Max</option>
              </select>
            </div>

            <Button onClick={handleGenerate} variant="primary" disabled={isGenerating}>
              {isGenerating ? 'Generating…' : 'Generate cards'}
            </Button>
          </div>
        )}

        {/*
          The working state is a scrim over the zone it belongs to — the one
          place a blur is permitted (§7.8). Nothing in it animates: the cards
          arriving below, the count and the elapsed time are the progress
          (FLOW-06). Only the phase is announced; the counter is aria-hidden.
        */}
        <AnimatePresence>
          {isGenerating && (
            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={reduced ? { duration: 0 } : motionTransitions.panel}
              className="absolute inset-0 z-[var(--z-sticky)] flex flex-col items-center justify-center gap-1 rounded-[var(--radius-container)] bg-[color-mix(in_srgb,var(--bg)_80%,transparent)] px-6 text-center backdrop-blur-[4px]"
            >
              <p role="status" aria-live="polite" className="text-sm font-medium">
                {generation.stopping
                  ? 'Stopping'
                  : generatedCards.length === 0 ? 'Reading your PDF' : 'Writing cards'}
              </p>
              <div aria-hidden="true" className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
                <ElapsedTelemetry key={startedAt} baseMs={0} running />
                <span className="font-mono text-[13px] tnum text-ink-dim">
                  {generatedCards.length} {generatedCards.length === 1 ? 'card' : 'cards'} saved
                  {generation.progress.sections > 1 && (
                    <> · section {Math.min(generation.progress.sectionsRead + 1, generation.progress.sections)} of {generation.progress.sections}</>
                  )}
                </span>
              </div>
              <p className="mt-1 max-w-sm text-xs text-ink-dim">
                Each card is saved as it&apos;s written. You can leave this page; the rest will still be added to this deck.
              </p>
              <Button
                size="sm"
                className="mt-3"
                onClick={generation.cancel}
                disabled={generation.stopping}
              >
                {generation.stopping ? 'Stopping…' : 'Stop'}
              </Button>
            </m.div>
          )}
        </AnimatePresence>
      </div>

      {/* ─── Generated cards ─── */}
      {generatedCards.length > 0 && (
        <div className="space-y-3">
          <p className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
            <span className="tnum">{generatedCards.length}</span> {isGenerating ? 'saved so far' : 'cards generated and saved'}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {generatedCards.map((card) => (
              <div key={card.id} className="surface p-4">
                {/* `front` is the answer and `back` is the question in this schema
                    (design system §7.6), so the preview reads in study order. */}
                <p className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
                  Question
                </p>
                <p className="mt-1 text-sm leading-relaxed">{card.back}</p>
                <hr className="my-3 border-border" />
                <p className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
                  Answer
                </p>
                <p className="mt-1 text-sm leading-relaxed text-ink-dim">{card.front}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** One toast for how the run ended. Sonner is global, so it shows even after the user has left the page. */
function reportOutcome(outcome: GenerationOutcome, requested: number) {
  const cards = (n: number) => `${n} card${n === 1 ? '' : 's'}`;

  if (outcome.kind === 'cancelled') {
    toast(outcome.saved > 0 ? `Stopped. ${cards(outcome.saved)} saved.` : 'Stopped. No cards were saved.');
    return;
  }

  if (outcome.kind === 'error') {
    if (outcome.saved > 0) toast.warning(`${cards(outcome.saved)} saved. ${outcome.message}`, { duration: 8000 });
    else toast.error(outcome.message);
    return;
  }

  if (outcome.limited) {
    toast.warning(`${cards(outcome.saved)} generated. ${outcome.limited}`, { duration: 8000 });
  } else if (outcome.failedSections > 0) {
    // A long PDF is split into sections; one failing section no longer
    // loses the document, but the user should know it happened.
    const failed = outcome.failedSections;
    toast.warning(
      `${cards(outcome.saved)} generated. ${failed} section${failed === 1 ? '' : 's'} of the PDF couldn't be processed — you can re-upload just those pages.`,
      { duration: 8000 },
    );
  } else if (outcome.saved < requested) {
    toast.success(`${cards(outcome.saved)} generated (AI stopped early after covering the material).`);
  } else {
    toast.success(`${cards(outcome.saved)} generated and saved!`);
  }
}
