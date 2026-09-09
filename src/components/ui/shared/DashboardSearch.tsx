'use client';

import { Search, X } from 'lucide-react';

type DashboardSearchProps = {
  value: string;
  onChange: (value: string) => void;
  resultCount: number;
  totalCount: number;
};

/**
 * Filters the deck index by name.
 *
 * The field is a control, so its edge is `--border-control` (≥3:1, WCAG 2.2
 * SC 1.4.11) and focus is a 2px `--accent` outline — not the translucent
 * blurred pill with a soft ring it replaces.
 */
export function DashboardSearch({ value, onChange, resultCount, totalCount }: DashboardSearchProps) {
  return (
    <div className="relative">
      <div className="flex h-[34px] items-center gap-2 rounded-[var(--radius-control)] border border-[var(--border-control)] px-3 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--accent)]">
        <Search className="h-3.5 w-3.5 shrink-0 text-ink-dimmer" />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Filter decks"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-ink-dimmer"
          aria-label="Filter decks by name"
        />
        {value ? (
          <button
            type="button"
            onClick={() => onChange('')}
            className="flex h-4 w-4 items-center justify-center rounded-[var(--radius-control)] text-ink-dimmer transition-colors hover:text-ink"
            aria-label="Clear filter"
          >
            <X className="h-3 w-3" />
          </button>
        ) : null}
      </div>

      {/* A count, announced politely — the filter changes what is on screen and
          a screen-reader user gets no other signal that it did. */}
      <p className="sr-only" aria-live="polite">
        {value
          ? resultCount === 0
            ? 'No decks match the filter'
            : `Showing ${resultCount} of ${totalCount} decks`
          : ''}
      </p>
    </div>
  );
}
