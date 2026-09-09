'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { m, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Upload, X } from 'lucide-react';
import { bulkImportCards } from '@/app/actions/card';
import { sanitizeNotes } from '@/app/actions/ai-assist';
import { enrichCards } from '@/app/actions/ai-enrich';
import { BulkImportPreview } from '@/components/ui/shared/BulkImportPreview';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { parseDelimitedNotes } from '@/lib/parser';
import { formatActionError } from '@/lib/ai-feedback';
import { motionTransitions } from '@/lib/motion-configs';
import { toast } from 'sonner';

type BulkImportModalProps = {
  deckId: string;
};

export function BulkImportModal({ deckId }: BulkImportModalProps) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [delimiter, setDelimiter] = useState(' - ');
  const [importedBy, setImportedBy] = useState('');
  const [isCleaning, setIsCleaning] = useState(false);
  const [isImporting, startImportTransition] = useTransition();
  const [, startEnrichTransition] = useTransition();
  const dialogRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const triggerRef = useRef<HTMLElement | null>(null);

  const preview = useMemo(() => parseDelimitedNotes(notes, delimiter), [notes, delimiter]);

  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement as HTMLElement;
      requestAnimationFrame(() => {
        const textarea = dialogRef.current?.querySelector('textarea');
        textarea?.focus();
      });
      return;
    }

    if (triggerRef.current) {
      triggerRef.current.focus();
      triggerRef.current = null;
    }
  }, [open]);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!open) {
      return;
    }

    if (event.key === 'Escape' && !isImporting && !isCleaning) {
      setOpen(false);
    }
  }, [isCleaning, isImporting, open]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  async function handleSanitize() {
    if (!notes.trim()) {
      toast.error('Paste some notes first.');
      return;
    }

    setIsCleaning(true);
    const result = await sanitizeNotes({ raw_text: notes });
    setIsCleaning(false);

    if (result?.error) {
      toast.error(formatActionError(result.error, 'Failed to clean notes'));
      return;
    }

    if (result?.success && result.text) {
      setNotes(result.text);
      toast.success('Notes cleaned. Review the preview before importing.');
    }
  }

  function resetModal() {
    setNotes('');
    setDelimiter(' - ');
    setImportedBy('');
    setOpen(false);
  }

  function handleImport() {
    if (preview.cards.length === 0) {
      toast.error('No valid cards to import.');
      return;
    }

    startImportTransition(async () => {
      const result = await bulkImportCards({
        deck_id: deckId,
        cards: preview.cards.map((card) => ({ front: card.front, back: card.back })),
        imported_by: importedBy.trim() || undefined,
      });

      if (result?.error) {
        toast.error(formatActionError(result.error, 'Import failed'));
        return;
      }

      toast.success(`${result.count} cards imported.`);
      resetModal();

      // Fire enrichment in the background so quiz MCQ distractors and ID
      // questions are ready before the user starts their first quiz.
      const importedCardIds = result.cardIds ?? [];
      if (importedCardIds.length > 0) {
        startEnrichTransition(async () => {
          await enrichCards({ deck_id: deckId, card_ids: importedCardIds });
        });
      }
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-2">
        <Upload className="h-4 w-4" />
        Bulk import
      </Button>

      <AnimatePresence>
        {open ? (
          <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center px-4 py-6">
            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={reduced ? { duration: 0 } : motionTransitions.panel}
              className="absolute inset-0 z-[var(--z-overlay)] bg-[color-mix(in_srgb,var(--bg)_80%,transparent)] backdrop-blur-[4px]"
              onClick={() => !isImporting && !isCleaning && setOpen(false)}
            />

            <m.div
              ref={dialogRef}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={reduced ? { duration: 0 } : motionTransitions.panel}
              className="panel relative z-[var(--z-modal)] flex max-h-[calc(100vh-3rem)] w-full max-w-6xl flex-col overflow-hidden"
              role="dialog"
              aria-modal="true"
              aria-labelledby="bulk-import-title"
            >
              <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
                <div className="space-y-1">
                  <p className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
                    Bulk import
                  </p>
                  <h2 id="bulk-import-title" className="text-base font-semibold tracking-[-.015em]">
                    Paste your notes
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Exact Term-Description lines, previewed live. Quiz data is enriched in the
                    background after import.
                  </p>
                </div>
                <Button type="button" size="icon-sm" variant="ghost" aria-label="Close"
                  onClick={() => !isImporting && !isCleaning && setOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto px-6 py-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-[minmax(0,140px)_minmax(0,1fr)]">
                    <div className="space-y-2">
                      <Label htmlFor="bulk-delimiter">Delimiter</Label>
                      <Input
                        id="bulk-delimiter"
                        value={delimiter}
                        onChange={(event) => setDelimiter(event.target.value)}
                        placeholder=" - "
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bulk-imported-by">Source Attribution</Label>
                      <Input
                        id="bulk-imported-by"
                        value={importedBy}
                        onChange={(event) => setImportedBy(event.target.value)}
                        placeholder="e.g. Prof. Lee Lecture 4"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor="bulk-notes">Notes</Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleSanitize}
                        disabled={isCleaning || isImporting || !notes.trim()}
                        className="gap-2"
                      >
                        {/* A verb beats a wand (§6). */}
                        {isCleaning ? 'Cleaning…' : 'Clean up'}
                      </Button>
                    </div>
                    <Textarea
                      id="bulk-notes"
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      className="min-h-[22rem]"
                      placeholder={'Mitochondria - The powerhouse of the cell\nPhotosynthesis - Process plants use to convert sunlight into energy'}
                    />
                    <p className="text-xs text-muted-foreground">
                      Import preserves your exact parsed term and description text. AI only fills quiz helper fields after save.
                    </p>
                  </div>
                </div>

                <BulkImportPreview result={preview} />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-6 py-4">
                <div className="text-sm text-muted-foreground">
                  Only valid preview rows will be imported.
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={isImporting || isCleaning}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={handleImport}
                    variant="primary"
                    disabled={isImporting || isCleaning || preview.cards.length === 0}
                  >
                    {isImporting
                      ? 'Importing…'
                      : `Import ${preview.cards.length} card${preview.cards.length === 1 ? '' : 's'}`}
                  </Button>
                </div>
              </div>
            </m.div>
          </div>
        ) : null}
      </AnimatePresence>
    </>
  );
}