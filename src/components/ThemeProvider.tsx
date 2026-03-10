'use client';

import { createContext, useContext, useEffect, useRef, useState, useCallback, useSyncExternalStore } from 'react';

type Theme = 'dark' | 'light';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  toggleTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === 'undefined') {
      return 'dark';
    }

    const stored = localStorage.getItem('cognit-theme');
    return stored === 'light' || stored === 'dark' ? stored : 'dark';
  });
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
    localStorage.setItem('cognit-theme', theme);

    return undefined;
  }, [applyTheme, theme, mounted]);

  useEffect(() => finishTransition, [finishTransition]);

  const toggleTheme = useCallback(() => {
    if (!mounted || isTransitioning) return;

    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    const root = document.documentElement;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    clearTransitionTimers();

    if (prefersReducedMotion) {
      setTheme(nextTheme);
      return;
    }

    root.classList.add('theme-transitioning');
    setIsTransitioning(true);

    transitionTimeoutsRef.current = [
      window.setTimeout(() => {
        setTheme(nextTheme);
      }, 110),
      window.setTimeout(() => {
        finishTransition();
      }, 430),
    ];
  }, [clearTransitionTimers, finishTransition, isTransitioning, mounted, theme]);

  // Prevent flash: inline script in layout.tsx handles initial class, just render children
  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
      <div
        aria-hidden="true"
        className={isTransitioning ? 'theme-fade-overlay is-visible' : 'theme-fade-overlay'}
      />
    </ThemeContext.Provider>
  );
}
