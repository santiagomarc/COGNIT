'use client';

import { useState } from 'react';
import { Search, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type DashboardSearchProps = {
  value: string;
  onChange: (value: string) => void;
  resultCount: number;
  totalCount: number;
};

export function DashboardSearch({ value, onChange, resultCount, totalCount }: DashboardSearchProps) {
  const [focused, setFocused] = useState(false);

  return (
    <div className="relative">
      <div
        className={`flex items-center gap-2 rounded-xl border bg-card/40 backdrop-blur-sm px-3 py-2 transition-all duration-200 ${
          focused
            ? 'border-primary ring-[3px] ring-glow shadow-[0_0_16px_-2px_var(--glow)]'
            : 'border-input/50 dark:border-primary/15'
        }`}
      >
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Search decks..."
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
          aria-label="Search decks"
        />
        <AnimatePresence>
          {value && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.15 }}
              type="button"
              onClick={() => onChange('')}
              className="flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3 w-3" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Result count indicator */}
      <AnimatePresence>
        {value && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="mt-2 text-xs text-muted-foreground"
          >
            {resultCount === 0
              ? 'No decks found'
              : `Showing ${resultCount} of ${totalCount} deck${totalCount !== 1 ? 's' : ''}`}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
