'use client';

import { useState, useRef, useCallback, useTransition, type DragEvent, type ChangeEvent } from 'react';
import { generateCards } from '@/app/actions/ai-generate';
import { enrichCards } from '@/app/actions/ai-enrich';
import { Button } from '@/components/ui/button';
import { formatActionError } from '@/lib/ai-feedback';
import { toast } from 'sonner';
import { m, AnimatePresence } from 'framer-motion';
import { Upload, FileText, Brain, Sparkles, X, CheckCircle2 } from 'lucide-react';

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
      {/* ─── Drop Zone ─── */}
      <div className="glass-card relative rounded-2xl p-5 text-card-foreground">
        <div className="mb-4 space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold tracking-tight">Generate from PDF</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Upload a PDF and our AI will create flashcards from its content.
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
          className={`
            group relative flex min-h-40 cursor-pointer flex-col items-center justify-center
            rounded-xl border-2 border-dashed transition-all duration-300
            ${isDragging
              ? 'border-border-strong bg-primary/10'
              : selectedFile
                ? 'border-border-strong bg-primary/5'
                : 'border-border-strong bg-card/30 hover:border-border-strong hover:bg-card/50'
            }
          `}
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
            <m.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-3 p-6"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <FileText className="h-6 w-6 text-primary" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium">{selectedFile.name}</p>
                <p className="text-xs text-muted-foreground">
                  <span className="font-mono tnum">{(selectedFile.size / 1024 / 1024).toFixed(2)}</span>&nbsp;MB
                </p>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  clearFile();
                }}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
              >
                <X className="h-3 w-3" />
                Remove
              </button>
            </m.div>
          ) : (
            <div className="flex flex-col items-center gap-3 p-6">
              <div className={`
                flex h-12 w-12 items-center justify-center rounded-full transition-colors
                ${isDragging ? 'bg-primary/20' : 'bg-muted/50 group-hover:bg-primary/10'}
              `}>
                <Upload className={`h-6 w-6 transition-colors ${isDragging ? 'text-primary' : 'text-muted-foreground group-hover:text-primary'}`} />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium">
                  {isDragging ? 'Drop your PDF here' : 'Drag & drop a PDF here'}
                </p>
                <p className="text-xs text-muted-foreground">or click to browse (max 10 MB)</p>
              </div>
            </div>
          )}
        </div>

        {/* Controls row */}
        {selectedFile && (
          <m.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 flex flex-wrap items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2">
              <label htmlFor="card-count" className="text-sm text-muted-foreground">
                Max cards to generate:
              </label>
              <select
                id="card-count"
                value={maxCardChoice}
                onChange={(e) => setMaxCardChoice(e.target.value)}
                className="h-8 rounded-lg border border-border-strong bg-card/60 px-2 text-sm backdrop-blur-sm outline-none focus:border-[var(--border-control)] focus:ring-2 focus:ring-ring"
              >
                {[5, 10, 15, 20, 25].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
                <option value="max">Max</option>
              </select>
            </div>

            <Button onClick={handleGenerate} disabled={isGenerating}>
              <Sparkles className="h-4 w-4" />
              Generate Cards
            </Button>
          </m.div>
        )}

        {/* ─── Generation Overlay ─── */}
        <AnimatePresence>
          {isGenerating && (
            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl bg-background/80 backdrop-blur-md"
            >
              <m.div
                animate={{ scale: [1, 1.15, 1] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10"
              >
                <Brain className="h-8 w-8 text-primary" />
              </m.div>
              <p className="text-sm font-medium">Generating cards...</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Reading your PDF and creating flashcards with AI
              </p>
              <m.div
                className="mt-4 h-1 w-48 overflow-hidden rounded-full bg-muted"
              >
                <m.div
                  className="h-full rounded-full bg-primary"
                  animate={{ x: ['-100%', '100%'] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                  style={{ width: '50%' }}
                />
              </m.div>
            </m.div>
          )}
        </AnimatePresence>
      </div>

      {/* ─── Generated Cards Preview ─── */}
      <AnimatePresence>
        {generatedCards.length > 0 && (
          <m.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="space-y-3"
          >
            <div className="flex items-center gap-2 text-sm font-medium text-primary">
              <CheckCircle2 className="h-4 w-4" />
              {generatedCards.length} cards generated and saved
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {generatedCards.map((card, i) => (
                <m.div
                  key={i}
                  initial={{ opacity: 0, y: 16, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{
                    delay: i * 0.06,
                    type: 'spring',
                    stiffness: 260,
                    damping: 20,
                  }}
                  className="glass-card rounded-xl p-4"
                >
                  <p className="text-xs font-semibold uppercase tracking-wider text-primary/70 mb-1">
                    Q
                  </p>
                  <p className="text-sm leading-relaxed">{card.front}</p>
                  <hr className="my-2 border-border" />
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink-dim mb-1">
                    A
                  </p>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {card.back}
                  </p>
                </m.div>
              ))}
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
