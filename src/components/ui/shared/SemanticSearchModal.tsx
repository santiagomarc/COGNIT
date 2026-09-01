'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Sparkles, X, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { semanticSearchCards, type SemanticSearchResult } from '@/app/actions/chat';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { removeDeckTagFromTitle } from '@/lib/deck-tags';
import { formatActionError } from '@/lib/ai-feedback';

type SearchStatus = 'idle' | 'loading' | 'done' | 'error';

export function SemanticSearchModal() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<SearchStatus>('idle');
  const [results, setResults] = useState<SemanticSearchResult[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement as HTMLElement;
      requestAnimationFrame(() => {
        dialogRef.current?.querySelector('input')?.focus();
      });
      return;
    }

    if (triggerRef.current) {
      triggerRef.current.focus();
      triggerRef.current = null;
    }
  }, [open]);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (open && event.key === 'Escape') {
      setOpen(false);
    }
  }, [open]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  async function runSearch(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      setErrorMessage('Type at least 3 characters to search.');
      setStatus('error');
      return;
    }

    setStatus('loading');
    setErrorMessage(null);

    const result = await semanticSearchCards({ query: trimmed });

    if (result?.error) {
      setStatus('error');
      setErrorMessage(formatActionError(result.error, 'Search failed. Please try again.'));
      return;
    }

    setResults(result?.results ?? []);
    setStatus('done');
  }

  function resetAndClose() {
    setOpen(false);
    setQuery('');
    setResults([]);
    setStatus('idle');
    setErrorMessage(null);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-xl border border-input/50 bg-card/40 px-3 py-2 text-sm text-muted-foreground backdrop-blur-sm transition-colors hover:border-primary/40 hover:text-foreground dark:border-primary/15"
        aria-label="Search across all your decks"
      >
        <Sparkles className="h-4 w-4 text-primary" />
        <span>Search all decks</span>
      </button>

      <AnimatePresence>
        {open ? (
          <div className="fixed inset-0 z-[110] flex items-start justify-center px-4 py-6 sm:items-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/55 backdrop-blur-sm"
              onClick={resetAndClose}
            />

            <motion.div
              ref={dialogRef}
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              className="glass-card relative z-10 flex max-h-[calc(100vh-3rem)] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-primary/15"
              role="dialog"
              aria-modal="true"
              aria-labelledby="semantic-search-title"
            >
              <div className="flex items-start justify-between gap-4 border-b border-primary/10 px-6 py-5">
                <div className="space-y-1">
                  <h2 id="semantic-search-title" className="text-xl font-semibold tracking-tight">
                    Search all decks
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Search by meaning, not just exact words, across every deck.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={resetAndClose}
                  className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
                <form onSubmit={runSearch} className="flex gap-2">
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="e.g. how does the immune system respond to infection"
                    className="flex-1"
                  />
                  <Button type="submit" disabled={status === 'loading'} className="gap-2">
                    <Search className="h-4 w-4" />
                    {status === 'loading' ? 'Searching...' : 'Search'}
                  </Button>
                </form>

                {status === 'error' && errorMessage ? (
                  <p className="text-sm text-destructive" role="alert">{errorMessage}</p>
                ) : null}

                {status === 'done' && results.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 rounded-2xl border border-primary/10 bg-primary/5 p-8 text-center text-sm text-muted-foreground">
                    <Search className="h-8 w-8 opacity-40" />
                    <p>No matching cards found.</p>
                    <p className="text-xs">
                      Search only covers cards that have been indexed for deck chat. Open a deck&apos;s chat panel once to index it.
                    </p>
                  </div>
                ) : null}

                {results.length > 0 ? (
                  <ul className="space-y-3">
                    {results.map((card) => (
                      <li key={card.id}>
                        <Link
                          href={`/dashboard/${card.deck_id}`}
                          onClick={resetAndClose}
                          className="group flex items-start justify-between gap-3 rounded-2xl border border-primary/10 bg-card/40 p-4 transition-colors hover:border-primary/30 hover:bg-primary/5"
                        >
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                                {removeDeckTagFromTitle(card.deck_title)}
                              </span>
                              <span className="text-[11px] text-muted-foreground">
                                {Math.round(card.similarity * 100)}% match
                              </span>
                            </div>
                            <p className="truncate text-sm font-medium text-foreground">{card.front}</p>
                            <p className="line-clamp-2 text-xs text-muted-foreground">{card.back}</p>
                          </div>
                          <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
