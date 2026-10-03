'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { m, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ArrowRight, X } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { semanticSearchCards, type SemanticSearchResult } from '@/app/actions/chat';
import { logout } from '@/app/auth/actions';
import { useTheme } from '@/components/ThemeProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/Kbd';
import {
  buildPaletteCommands,
  filterPaletteCommands,
  groupPaletteCommands,
  paletteOpenAfterHotkey,
  type PaletteCommand,
  type PaletteDeck,
} from '@/lib/command-palette';
import { OPEN_COMMAND_PALETTE_EVENT, requestOpenCreateDeck, requestOpenShortcuts } from '@/lib/dashboard-events';
import { removeDeckTagFromTitle } from '@/lib/deck-tags';
import { pageShortcutBlocked } from '@/lib/hotkeys';
import { formatActionError } from '@/lib/ai-feedback';
import { motionTransitions } from '@/lib/motion-configs';
import { useModalDialog } from '@/lib/use-modal-dialog';

type SearchStatus = 'idle' | 'loading' | 'done' | 'error';

/** The minimum a semantic search will accept — below it the row is inert. */
const MIN_SEARCH_LENGTH = 3;

type CommandPaletteProps = {
  decks: PaletteDeck[];
  /** Where "start session" goes. Null when the account has no decks at all. */
  sessionHref: string | null;
  totalDue: number;
};

/** One selectable row, whatever produced it. */
type PaletteRow = {
  key: string;
  label: string;
  hint?: string;
  /** Second line — only search results have one. */
  detail?: string;
  /** Where `run` navigates, when it navigates — prefetched under the cursor. */
  href?: string;
  run: () => void;
};

/**
 * The `⌘K` command palette (design system §8, task 8.4).
 *
 * This is the semantic-search dialog grown into a launcher, not a second modal
 * system: the overlay, the scrim, the focus trap and the search plumbing are
 * the ones that were already here. What is new is the command list above the
 * results and the keyboard traversal through it.
 *
 * It has no trigger of its own (sidebar plan §6.8): the sidebar's Search
 * control and ⌘K open it, through OPEN_COMMAND_PALETTE_EVENT and the hotkey
 * below. It matters more than it looks — it is the only place that reaches
 * *every* deck without a round trip through the index, and the only place
 * `sign out` lives on a route with no chrome.
 *
 * Interaction model is combobox + listbox: focus stays in the input and the
 * active row is tracked with `aria-activedescendant`. Arrow keys would fight a
 * roving tabindex otherwise, and the Tab trap stays two elements wide.
 */
export function CommandPalette({ decks, sessionHref, totalDue }: CommandPaletteProps) {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [status, setStatus] = useState<SearchStatus>('idle');
  const [results, setResults] = useState<SemanticSearchResult[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  /** Whatever had focus when the palette opened: the sidebar's Search, or the page. */
  const openerRef = useRef<HTMLElement | null>(null);
  const reduced = useReducedMotion();

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setResults([]);
    setStatus('idle');
    setErrorMessage(null);
    setActiveIndex(0);
  }, []);

  const dialogRef = useModalDialog({
    open,
    onClose: close,
    initialFocus: (dialog) => dialog.querySelector<HTMLInputElement>('input'),
  });

  // Remember the opener before useModalDialog moves focus into the input (it
  // does so a frame later), so an effect that opens a second dialog can hand
  // focus back to it: the sidebar's Search button, or wherever ⌘K was pressed.
  useEffect(() => {
    if (open) openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, [open]);

  // ⌘K / Ctrl+K closes an open palette and opens one over any page no other
  // dialog covers; the sidebar's Search control opens it through the event
  // below, so every trigger shares one dialog.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        // Read before the update: once open, the palette's own dialog blocks.
        const blocked = pageShortcutBlocked(event);
        setOpen((value) => paletteOpenAfterHotkey(value, blocked));
      }
    };

    const onOpenRequest = () => setOpen(true);

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpenRequest);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpenRequest);
    };
  }, []);

  const runSearch = useCallback(async (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed.length < MIN_SEARCH_LENGTH) return;

    setStatus('loading');
    setErrorMessage(null);

    try {
      const result = await semanticSearchCards({ query: trimmed });

      if (result?.error || !result?.success) {
        setStatus('error');
        setResults([]);
        setErrorMessage(formatActionError(result?.error, 'Search failed. Please try again.'));
        return;
      }

      setResults(result.results ?? []);
      setStatus('done');
    } catch {
      setStatus('error');
      setResults([]);
      setErrorMessage('Search is unavailable right now. Please try again.');
    }
  }, []);

  const runEffect = useCallback(
    (effect: NonNullable<PaletteCommand['effect']>) => {
      close();

      /*
       * Exhaustive on purpose. This used to end in a bare `void logout()`, so
       * any effect it did not name signed the user out — adding one would
       * have made "Keyboard shortcuts" a sign-out button (sidebar plan §5.12).
       */
      switch (effect) {
        case 'toggle-theme':
          toggleTheme();
          return;
        case 'new-deck':
        case 'show-shortcuts':
          /*
           * Hand focus back to whatever opened the palette *before* asking for
           * the next dialog, which restores focus to the element active when
           * it opened; by then this palette's input has unmounted.
           */
          openerRef.current?.focus();
          if (effect === 'new-deck') requestOpenCreateDeck();
          else requestOpenShortcuts();
          return;
        case 'sign-out':
          void logout();
          return;
        default: {
          const unhandled: never = effect;
          throw new Error(`Unhandled palette effect: ${String(unhandled)}`);
        }
      }
    },
    [close, toggleTheme]
  );

  const commands = useMemo(
    () =>
      buildPaletteCommands({
        decks,
        sessionHref,
        totalDue,
        themeCommandLabel: theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
      }),
    [decks, sessionHref, totalDue, theme]
  );

  const sections = useMemo(
    () => groupPaletteCommands(filterPaletteCommands(commands, query)),
    [commands, query]
  );

  const canSearch = query.trim().length >= MIN_SEARCH_LENGTH;

  /*
   * Every selectable row in render order. The active index addresses this
   * array, so commands, the search row and the results are one keyboard track
   * rather than three.
   */
  const rows = useMemo<PaletteRow[]>(() => {
    const flat: PaletteRow[] = [];

    for (const section of sections) {
      for (const command of section.commands) {
        flat.push({
          key: command.id,
          label: command.label,
          hint: command.hint,
          href: command.href,
          run: () => {
            if (command.href) {
              close();
              router.push(command.href);
              return;
            }
            if (command.effect) runEffect(command.effect);
          },
        });
      }
    }

    if (canSearch) {
      flat.push({
        key: 'run-search',
        label: `Search card text for “${query.trim()}”`,
        hint: status === 'loading' ? 'Searching…' : 'Enter',
        run: () => void runSearch(query),
      });
    }

    for (const card of results) {
      const href = `/dashboard/${card.deck_id}`;
      flat.push({
        key: `result:${card.id}`,
        label: card.front,
        detail: card.back,
        hint: `${removeDeckTagFromTitle(card.deck_title)} · ${Math.round(card.similarity * 100)}%`,
        href,
        run: () => {
          close();
          router.push(href);
        },
      });
    }

    return flat;
  }, [sections, canSearch, query, status, results, close, router, runEffect, runSearch]);

  // Keep the cursor inside the list as rows appear and disappear under it.
  useEffect(() => {
    setActiveIndex((index) => (index >= rows.length ? Math.max(rows.length - 1, 0) : index));
  }, [rows.length]);

  /*
   * Warm the destination under the cursor. Rows navigate with `router.push`,
   * which — unlike `<Link>` — prefetches nothing on its own, so without this
   * every jump from the palette paid a full server round-trip before even the
   * skeleton appeared. Hover and the arrow keys both move the cursor, so one
   * effect covers both, and the router de-duplicates repeat requests.
   */
  useEffect(() => {
    if (!open) return;
    const href = rows[activeIndex]?.href;
    if (href) router.prefetch(href);
  }, [open, rows, activeIndex, router]);

  useEffect(() => {
    if (!open) return;
    const active = listRef.current?.querySelector('[data-active="true"]');
    active?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  /*
   * Bound on the dialog rather than the input: Tab can put focus on the close
   * button, and arrow keys that stop working once you have tabbed once are a
   * keyboard trap of a subtler kind. Enter is the exception — it stays with
   * whatever control has focus, so Tab-then-Enter still closes the dialog.
   */
  function handleDialogKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (rows.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % rows.length);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + rows.length) % rows.length);
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(rows.length - 1);
      return;
    }

    if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
      event.preventDefault();
      rows[activeIndex]?.run();
    }
  }

  let cursor = 0;

  return (
    <>
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
              onClick={close}
            />

            <m.div
              ref={dialogRef}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={reduced ? { duration: 0 } : motionTransitions.panel}
              className="panel relative z-[var(--z-modal)] flex max-h-[calc(100dvh-3rem)] w-full max-w-2xl flex-col overflow-hidden"
              role="dialog"
              aria-modal="true"
              aria-labelledby="command-palette-title"
              onKeyDown={handleDialogKeyDown}
            >
              <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
                <div className="space-y-1">
                  <p className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
                    Command palette
                  </p>
                  <h2 id="command-palette-title" className="text-base font-semibold tracking-[-.015em]">
                    Jump anywhere
                  </h2>
                </div>
                <Button type="button" size="icon-sm" variant="ghost" onClick={close} aria-label="Close">
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>

              <div className="border-b border-border px-5 py-4">
                <Input
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setActiveIndex(0);
                  }}
                  placeholder="Search decks, commands, or card text…"
                  role="combobox"
                  aria-expanded="true"
                  aria-controls="command-palette-list"
                  aria-activedescendant={rows[activeIndex] ? `palette-row-${rows[activeIndex].key}` : undefined}
                  aria-label="Search decks, commands, or card text"
                  autoComplete="off"
                />
              </div>

              <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
                {errorMessage ? (
                  <p className="px-3 py-2 text-sm text-destructive" role="alert">
                    {errorMessage}
                  </p>
                ) : null}

                {rows.length === 0 ? (
                  <p className="px-3 py-6 text-center text-sm text-ink-dim">
                    Nothing matches “{query.trim()}”.
                  </p>
                ) : null}

                <div id="command-palette-list" role="listbox" aria-label="Commands and results">
                  {sections.map((section) => (
                    <div key={section.group} className="mb-1">
                      <p className="px-3 pb-1 pt-2 font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
                        {section.group}
                      </p>
                      {section.commands.map((command) => (
                        <PaletteRowView key={command.id} row={rows[cursor]} index={cursor++} activeIndex={activeIndex} onHover={setActiveIndex} />
                      ))}
                    </div>
                  ))}

                  {canSearch ? (
                    <div className="mb-1 border-t border-border pt-1">
                      <PaletteRowView row={rows[cursor]} index={cursor++} activeIndex={activeIndex} onHover={setActiveIndex} />
                    </div>
                  ) : null}

                  {results.length > 0 ? (
                    <div className="border-t border-border pt-1">
                      <p className="px-3 pb-1 pt-2 font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
                        Cards
                      </p>
                      {results.map((card) => (
                        <PaletteRowView key={card.id} row={rows[cursor]} index={cursor++} activeIndex={activeIndex} onHover={setActiveIndex} />
                      ))}
                    </div>
                  ) : null}
                </div>

                {status === 'done' && results.length === 0 && canSearch ? (
                  <p className="px-3 py-3 text-xs text-ink-dim">
                    No matching cards. Search only covers cards indexed for deck chat — open a
                    deck&apos;s chat panel once to index it.
                  </p>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-5 py-3 text-xs text-ink-dim">
                <span className="inline-flex items-center gap-1.5">
                  <Kbd>↑</Kbd>
                  <Kbd>↓</Kbd> move
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Kbd>Enter</Kbd> run
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Kbd>Esc</Kbd> close
                </span>
              </div>
            </m.div>
          </div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

function PaletteRowView({
  row,
  index,
  activeIndex,
  onHover,
}: {
  row: PaletteRow | undefined;
  index: number;
  activeIndex: number;
  onHover: (index: number) => void;
}) {
  if (!row) return null;
  const isActive = index === activeIndex;

  return (
    <div
      id={`palette-row-${row.key}`}
      role="option"
      aria-selected={isActive}
      data-active={isActive}
      onMouseMove={() => onHover(index)}
      onClick={row.run}
      className="flex cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-sm)] px-3 py-2 data-[active=true]:bg-[var(--surface-raised)]"
    >
      <div className="min-w-0">
        <p className="truncate text-sm text-ink">{row.label}</p>
        {row.detail ? <p className="truncate text-xs text-ink-dim">{row.detail}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {row.hint ? (
          <span className="font-mono text-[11px] tnum text-ink-dimmer">{row.hint}</span>
        ) : null}
        <ArrowRight
          className="h-3.5 w-3.5 shrink-0 text-ink-dimmer opacity-0 data-[show=true]:opacity-100"
          data-show={isActive}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
