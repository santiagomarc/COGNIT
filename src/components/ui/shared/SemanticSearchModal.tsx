'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { m, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ArrowRight, Search, X } from 'lucide-react';
import Link from 'next/link';

import { semanticSearchCards, type SemanticSearchResult } from '@/app/actions/chat';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/Kbd';
import { removeDeckTagFromTitle } from '@/lib/deck-tags';
import { formatActionError } from '@/lib/ai-feedback';
import { motionTransitions } from '@/lib/motion-configs';

type SearchStatus = 'idle' | 'loading' | 'done' | 'error';

/**
 * Cross-deck semantic search (design system §7.8).
 *
 * The trigger shows its `⌘K` binding, and the binding is implemented here so
 * the keycap is not decoration. The full command palette — this dialog grown
 * into a launcher with the rail as a fallback — is the navigation phase's job;
 * this is only the shortcut that opens what already exists.
 */
export function SemanticSearchModal() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<SearchStatus>('idle');
  const [results, setResults] = useState<SemanticSearchResult[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const reduced = useReducedMotion();

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

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // ⌘K / Ctrl+K opens it from anywhere on the page.
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((value) => !value);
        return;
      }

      if (!open) return;

      if (event.key === 'Escape') {
        setOpen(false);
        return;
      }

      // Tab is trapped: a dialog that leaks focus to the page behind its scrim
      // is not modal (§9).
      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [open]
  );

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

    try {
      const result = await semanticSearchCards({ query: trimmed });

      if (result?.error || !result?.success) {
        setStatus('error');
        setErrorMessage(formatActionError(result?.error, 'Search failed. Please try again.'));
        return;
      }

      setResults(result.results ?? []);
      setStatus('done');
    } catch {
      setStatus('error');
      setErrorMessage('Search is unavailable right now. Please try again.');
    }
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
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="gap-2"
        aria-label="Search across all your decks"
      >
        <Search className="h-3.5 w-3.5" />
        Search
        <Kbd>⌘K</Kbd>
      </Button>

      <AnimatePresence>
        {open ? (
          <div className="fixed inset-0 z-[var(--z-modal)] flex items-start justify-center px-4 py-6 pb-[max(1.5rem,env(keyboard-inset-height,0px))] sm:items-center">
            {/* The scrim (§7.8) — the only permitted blur in the product. */}
            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={reduced ? { duration: 0 } : motionTransitions.panel}
              className="absolute inset-0 z-[var(--z-overlay)] bg-[color-mix(in_srgb,var(--bg)_80%,transparent)] backdrop-blur-[4px]"
              onClick={resetAndClose}
            />

            <m.div
              ref={dialogRef}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={reduced ? { duration: 0 } : motionTransitions.panel}
              className="surface relative z-[var(--z-modal)] flex max-h-[calc(100vh-3rem)] w-full max-w-2xl flex-col overflow-hidden border-border-strong"
              role="dialog"
              aria-modal="true"
              aria-labelledby="semantic-search-title"
            >
              <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
                <div className="space-y-1">
                  <p className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
                    Search
                  </p>
                  <h2 id="semantic-search-title" className="text-base font-semibold tracking-[-.015em]">
                    Search all decks
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Search by meaning, not just exact words, across every deck.
                  </p>
                </div>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  onClick={resetAndClose}
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
                <form onSubmit={runSearch} className="flex gap-2">
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="e.g. how does the immune system respond to infection"
                    className="flex-1"
                  />
                  <Button type="submit" variant="primary" disabled={status === 'loading'} className="gap-2">
                    {status === 'loading' ? 'Searching…' : 'Search'}
                    <Kbd>Enter</Kbd>
                  </Button>
                </form>

                {status === 'error' && errorMessage ? (
                  <p className="text-sm text-destructive" role="alert">{errorMessage}</p>
                ) : null}

                {status === 'done' && results.length === 0 ? (
                  <div className="border-t border-border pt-5 text-sm text-muted-foreground">
                    <p className="text-foreground">No matching cards found.</p>
                    <p className="mt-1 text-xs">
                      Search only covers cards that have been indexed for deck chat. Open a
                      deck&apos;s chat panel once to index it.
                    </p>
                  </div>
                ) : null}

                {results.length > 0 ? (
                  <ul className="divide-y divide-border border-t border-border">
                    {results.map((card) => (
                      <li key={card.id}>
                        <Link
                          href={`/dashboard/${card.deck_id}`}
                          onClick={resetAndClose}
                          className="group flex items-start justify-between gap-3 py-3 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                        >
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-baseline gap-3 font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
                              <span className="truncate">{removeDeckTagFromTitle(card.deck_title)}</span>
                              <span className="tnum">{Math.round(card.similarity * 100)}% match</span>
                            </div>
                            <p className="truncate text-sm font-medium text-foreground">{card.front}</p>
                            <p className="truncate text-xs text-muted-foreground">{card.back}</p>
                          </div>
                          <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-ink-dimmer transition-colors group-hover:text-ink" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </m.div>
          </div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
