'use client';

import { useState, useRef, useCallback, useTransition, type DragEvent, type ChangeEvent } from 'react';
import { generateCards } from '@/app/actions/ai-generate';
import { enrichCards } from '@/app/actions/ai-enrich';
import { Button } from '@/components/ui/button';
import { formatActionError } from '@/lib/ai-feedback';
import { motionTransitions } from '@/lib/motion-configs';
import { toast } from 'sonner';
import { m, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Upload, X } from 'lucide-react';

type PDFUploadZoneProps = {
  deckId: string;
};

type GeneratedCard = { front: string; back: string };

const PDF_GENERATION_MAX_COUNT = 30;

// Must stay in sync with MAX_PDF_BYTES in app/actions/ai-generate.ts. Rejecting
// oversized files here matters: a body larger than the Next.js transport limits
// is truncated before the server action runs, so the action's own size check
// never gets a chance to return its message.
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
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedCards, setGeneratedCards] = useState<GeneratedCard[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const reduced = useReducedMotion();
  const [, startEnrichTransition] = useTransition();

  const resolvedMaxCardCount = maxCardChoice === 'max' ? PDF_GENERATION_MAX_COUNT : Number(maxCardChoice);

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
    setGeneratedCards([]);
  }, []);

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
    setGeneratedCards([]);
  }, []);

  const clearFile = useCallback(() => {
    setSelectedFile(null);
    setGeneratedCards([]);
    if (inputRef.current) inputRef.current.value = '';
  }, []);

  // ── Generate ──
  async function handleGenerate() {
    if (!selectedFile) return;

    setIsGenerating(true);
    setGeneratedCards([]);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('deck_id', deckId);
      formData.append('count', maxCardChoice);

      const result = await generateCards(formData);

      if (result.error) {
        toast.error(formatActionError(result.error, 'Failed to generate cards.'));
      } else if (result.success && result.cards) {
        if (result.partial) {
          // A long PDF is split into sections; one failing section no longer
          // loses the document, but the user should know it happened.
          const failed = result.failedChunks ?? 0;
          toast.warning(
            `${result.count} cards generated. ${failed} section${failed === 1 ? '' : 's'} of the PDF couldn't be processed — you can re-upload just those pages.`,
            { duration: 8000 },
          );
        } else if (result.count < resolvedMaxCardCount) {
          toast.success(`${result.count} cards generated (AI stopped early after covering the material).`);
        } else {
          toast.success(`${result.count} cards generated and saved!`);
        }
        setGeneratedCards(result.cards);
        setSelectedFile(null);
        if (inputRef.current) inputRef.current.value = '';

        // Fire enrichment in the background — generates MCQ distractors and
        // identification questions so cards are quiz-ready immediately.
        const generatedIds = result.cardIds ?? [];
        if (generatedIds.length > 0) {
          startEnrichTransition(async () => {
            await enrichCards({ deck_id: deckId, card_ids: generatedIds });
          });
        }
      }
    } catch (err) {
      console.error('[PDFUploadZone] generateCards failed:', err);
      toast.error('Something went wrong. Please try again.');
    } finally {
      setIsGenerating(false);
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
          <p className="text-sm text-muted-foreground">
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
                className="mt-1 inline-flex items-center gap-1 rounded-[var(--radius-control)] text-xs text-ink-dimmer transition-colors hover:text-ink"
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
                className="h-[30px] rounded-[var(--radius-control)] border border-[var(--border-control)] bg-transparent px-2 text-sm outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
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
          place a blur is permitted (§7.8). What it replaces was a pulsing brain
          glyph, which said nothing about progress and everything about being an
          AI demo (§6).
        */}
        <AnimatePresence>
          {isGenerating && (
            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={reduced ? { duration: 0 } : motionTransitions.panel}
              className="absolute inset-0 z-[var(--z-sticky)] flex flex-col items-center justify-center rounded-[var(--radius-container)] bg-[color-mix(in_srgb,var(--bg)_80%,transparent)] backdrop-blur-[4px]"
              role="status"
              aria-live="polite"
            >
              <p className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
                Working
              </p>
              <p className="mt-2 text-sm font-medium">Reading your PDF and writing cards</p>
              <p className="mt-1 text-xs text-muted-foreground">
                This usually takes under a minute for a chapter.
              </p>

              <div className="mt-4 h-[3px] w-48 overflow-hidden bg-border">
                <m.div
                  className="h-full w-1/2 bg-ink-dim"
                  animate={reduced ? { x: '-100%' } : { x: ['-100%', '200%'] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                />
              </div>
            </m.div>
          )}
        </AnimatePresence>
      </div>

      {/* ─── Generated cards ─── */}
      {generatedCards.length > 0 && (
        <div className="space-y-3">
          <p className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
            <span className="tnum">{generatedCards.length}</span> cards generated and saved
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {generatedCards.map((card, i) => (
              <div key={i} className="surface p-4">
                <p className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
                  Question
                </p>
                <p className="mt-1 text-sm leading-relaxed">{card.front}</p>
                <hr className="my-3 border-border" />
                <p className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
                  Answer
                </p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{card.back}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
