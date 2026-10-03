'use client';

import { createContext, useContext, useEffect, useRef, useState, useCallback, useSyncExternalStore } from 'react';

import {
  THEME_STORAGE_KEY,
  parseThemePreference,
  resolveTheme,
  storedThemeValue,
  type ResolvedTheme,
  type ThemePreference,
} from '@/lib/theme';

type Theme = ResolvedTheme;

interface ThemeContextType {
  /** The theme on screen. What every existing caller reads. */
  theme: Theme;
  /** What the user chose: an explicit theme, or `system` (sidebar plan §5.4). */
  preference: ThemePreference;
  setPreference: (next: ThemePreference) => void;
  /** Sets the explicit opposite of the theme on screen (ThemeToggle, the palette). */
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  preference: 'system',
  setPreference: () => {},
  toggleTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

const LIGHT_QUERY = '(prefers-color-scheme: light)';

function subscribeToOsTheme(onChange: () => void) {
  const query = window.matchMedia(LIGHT_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/**
 * The stored preference (F-10, sidebar plan §5.4). An explicit choice always
 * wins. `system` is stored as the key's absence, which is exactly what the
 * pre-paint script in theme-script.ts already reads as "follow the OS", so the
 * script and its CSP hash are unchanged (theme.test.ts proves the two agree).
 *
 * The old provider wrote the resolved theme back to storage on every mount,
 * so "follow the OS" silently became a fixed choice after one visit. It is a
 * real, live preference now.
 */
function readPreference(): ThemePreference {
  try {
    return parseThemePreference(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    // Storage can throw in private browsing: follow the OS.
    return 'system';
  }
}

function writePreference(preference: ThemePreference) {
  try {
    const value = storedThemeValue(preference);
    if (value === null) localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, value);
  } catch {
    // Non-fatal: the choice just will not survive a reload.
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() =>
    typeof window === 'undefined' ? 'system' : readPreference(),
  );
  // Live, so `system` follows the OS without a reload.
  const prefersLight = useSyncExternalStore(
    subscribeToOsTheme,
    () => window.matchMedia(LIGHT_QUERY).matches,
    () => false,
  );
  const theme = resolveTheme(preference, prefersLight);
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const [isTransitioning, setIsTransitioning] = useState(false);
  const transitionTimeoutsRef = useRef<number[]>([]);

  const applyTheme = useCallback((nextTheme: Theme) => {
    const root = document.documentElement;

    root.classList.toggle('dark', nextTheme === 'dark');
    root.style.colorScheme = nextTheme;
  }, []);

  const clearTransitionTimers = useCallback(() => {
    for (const timeoutId of transitionTimeoutsRef.current) {
      window.clearTimeout(timeoutId);
    }

    transitionTimeoutsRef.current = [];
  }, []);

  const finishTransition = useCallback(() => {
    clearTransitionTimers();
    document.documentElement.classList.remove('theme-transitioning');
    setIsTransitioning(false);
  }, [clearTransitionTimers]);

  useEffect(() => {
    if (!mounted) return;

    applyTheme(theme);
    writePreference(preference);

    return undefined;
  }, [applyTheme, theme, preference, mounted]);

  useEffect(() => finishTransition, [finishTransition]);

  /*
   * A change that alters what is on screen gets the crossfade; one that does
   * not (System while the OS already matches) applies at once.
   */
  const setPreference = useCallback((next: ThemePreference) => {
    if (!mounted || isTransitioning) return;

    const nextTheme = resolveTheme(next, window.matchMedia(LIGHT_QUERY).matches);
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    clearTransitionTimers();

    if (nextTheme === theme || prefersReducedMotion) {
      setPreferenceState(next);
      return;
    }

    document.documentElement.classList.add('theme-transitioning');
    setIsTransitioning(true);

    transitionTimeoutsRef.current = [
      window.setTimeout(() => {
        setPreferenceState(next);
      }, 110),
      window.setTimeout(() => {
        finishTransition();
      }, 430),
    ];
  }, [clearTransitionTimers, finishTransition, isTransitioning, mounted, theme]);

  const toggleTheme = useCallback(() => {
    setPreference(theme === 'dark' ? 'light' : 'dark');
  }, [setPreference, theme]);

  // Prevent flash: inline script in layout.tsx handles initial class, just render children
  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <ThemeContext.Provider value={{ theme, preference, setPreference, toggleTheme }}>
      {children}
      <div
        aria-hidden="true"
        className={isTransitioning ? 'theme-fade-overlay is-visible' : 'theme-fade-overlay'}
      />
    </ThemeContext.Provider>
  );
}
