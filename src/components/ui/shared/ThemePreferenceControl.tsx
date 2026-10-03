'use client';

import { useRef } from 'react';

import { useTheme } from '@/components/ThemeProvider';
import { cn } from '@/lib/utils';
import { THEME_PREFERENCES, type ThemePreference } from '@/lib/theme';

const LABELS: Record<ThemePreference, string> = { dark: 'Dark', light: 'Light', system: 'System' };

/**
 * Dark · Light · System (sidebar plan §5.4, SET-03), as a segmented radio
 * group (design system §7.12): one tab stop, arrow keys move the selection,
 * Home and End jump. Used in Settings → Appearance and, in Phase 3, the
 * account menu.
 */
export function ThemePreferenceControl({ className }: { className?: string }) {
  const { preference, setPreference } = useTheme();
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const choose = (index: number) => {
    const count = THEME_PREFERENCES.length;
    const next = (index + count) % count;
    setPreference(THEME_PREFERENCES[next]);
    optionRefs.current[next]?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const moves: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowDown: index + 1,
      ArrowLeft: index - 1,
      ArrowUp: index - 1,
      Home: 0,
      End: THEME_PREFERENCES.length - 1,
    };
    if (!(event.key in moves)) return;
    event.preventDefault();
    choose(moves[event.key]);
  };

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn(
        'inline-flex rounded-[var(--radius-control)] border border-[var(--border-control)] p-[2px]',
        className,
      )}
    >
      {THEME_PREFERENCES.map((value, index) => {
        const checked = preference === value;
        return (
          <button
            key={value}
            ref={(node) => {
              optionRefs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => choose(index)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              'h-7 rounded-[4px] px-3 text-[13px] max-md:h-11 max-md:px-4',
              'outline-hidden transition-colors duration-[120ms] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]',
              checked ? 'bg-surface-raised text-ink' : 'text-ink-dim hover:text-ink',
            )}
          >
            {LABELS[value]}
          </button>
        );
      })}
    </div>
  );
}
