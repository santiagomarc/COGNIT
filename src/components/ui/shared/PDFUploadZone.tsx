'use client';

import { useState, useRef, useCallback, type DragEvent, type ChangeEvent } from 'react';
import { generateCards, enrichCards } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileText, Brain, Sparkles, X, CheckCircle2 } from 'lucide-react';

type PDFUploadZoneProps = {
  deckId: string;
};

type GeneratedCard = { front: string; back: string };

export function PDFUploadZone({ deckId }: PDFUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [cardCount, setCardCount] = useState(10);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedCards, setGeneratedCards] = useState<GeneratedCard[]>([]);
  const [isEnriching, setIsEnriching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
    if (file && file.type === 'application/pdf') {
      setSelectedFile(file);
      setGeneratedCards([]);
    } else {
      toast.error('Please drop a PDF file.');
    }
  }, []);

  const handleFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setGeneratedCards([]);
    }
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
      formData.append('count', String(cardCount));

      const result = await generateCards(formData);

      if (result.error) {
        const msg = typeof result.error === 'string'
          ? result.error
          : Object.values(result.error).flat().join(', ');
        toast.error(msg);
      } else if (result.success && result.cards) {
        toast.success(`${result.count} cards generated and saved!`);
        setGeneratedCards(result.cards);
        setSelectedFile(null);
        if (inputRef.current) inputRef.current.value = '';

        if (result.cardIds?.length) {
          setIsEnriching(true);
          void enrichCards({ deck_id: deckId, card_ids: result.cardIds })
            .then((enrichmentResult) => {
              if (enrichmentResult?.error) {
                toast.error(typeof enrichmentResult.error === 'string' ? enrichmentResult.error : 'Quiz enrichment failed');
                return;
              }

              if (enrichmentResult?.enrichedCount) {
                toast.success(`Quiz data prepared for ${enrichmentResult.enrichedCount} generated cards.`);
              }
            })
            .finally(() => setIsEnriching(false));
        }
      }
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* ─── Drop Zone ─── */}
      <div className="glass-card glow-border relative rounded-2xl p-5 text-card-foreground">
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
              ? 'border-primary bg-primary/10 shadow-[0_0_24px_-4px_var(--glow)]'
              : selectedFile
                ? 'border-primary/40 bg-primary/5'
                : 'border-primary/20 bg-card/30 hover:border-primary/40 hover:bg-card/50'
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
            <motion.div
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
                  {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
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
            </motion.div>
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
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 flex flex-wrap items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2">
              <label htmlFor="card-count" className="text-sm text-muted-foreground">
                Cards to generate:
              </label>
              <select
                id="card-count"
                value={cardCount}
                onChange={(e) => setCardCount(Number(e.target.value))}
                className="h-8 rounded-lg border border-primary/20 bg-card/60 px-2 text-sm backdrop-blur-sm outline-none focus:border-primary focus:ring-2 focus:ring-glow"
              >
                {[5, 10, 15, 20, 25, 30].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>

            <Button onClick={handleGenerate} disabled={isGenerating}>
              <Sparkles className="h-4 w-4" />
              Generate Cards
            </Button>
          </motion.div>
        )}

        {/* ─── Generation Overlay ─── */}
        <AnimatePresence>
          {isGenerating && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl bg-background/80 backdrop-blur-md"
            >
              <motion.div
                animate={{ scale: [1, 1.15, 1] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10"
              >
                <Brain className="h-8 w-8 text-primary" />
              </motion.div>
              <p className="text-sm font-medium">Generating cards...</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Reading your PDF and creating flashcards with AI
              </p>
              <motion.div
                className="mt-4 h-1 w-48 overflow-hidden rounded-full bg-muted"
              >
                <motion.div
                  className="h-full rounded-full bg-primary"
                  animate={{ x: ['-100%', '100%'] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                  style={{ width: '50%' }}
                />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ─── Generated Cards Preview ─── */}
      <AnimatePresence>
        {generatedCards.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="space-y-3"
          >
            <div className="flex items-center gap-2 text-sm font-medium text-primary">
              <CheckCircle2 className="h-4 w-4" />
              {generatedCards.length} cards generated and saved
            </div>
            {isEnriching && (
              <p className="text-xs text-muted-foreground">
                Preparing MCQ distractors and identification prompts in the background...
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {generatedCards.map((card, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 16, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{
                    delay: i * 0.06,
                    type: 'spring',
                    stiffness: 260,
                    damping: 20,
                  }}
                  className="glass-card glow-border rounded-xl p-4"
                >
                  <p className="text-xs font-semibold uppercase tracking-wider text-primary/70 mb-1">
                    Q
                  </p>
                  <p className="text-sm leading-relaxed">{card.front}</p>
                  <hr className="my-2 border-primary/10" />
                  <p className="text-xs font-semibold uppercase tracking-wider text-neon/70 mb-1">
                    A
                  </p>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {card.back}
                  </p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
