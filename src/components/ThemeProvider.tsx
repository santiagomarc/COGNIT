'use client';

import { createContext, useContext, useEffect, useState, useCallback, useSyncExternalStore } from 'react';

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

  useEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;

    // Enable smooth transition for theme switch
    root.classList.add('theme-transitioning');

    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('cognit-theme', theme);

    // Remove the transitioning class after the animation completes
    const timeout = setTimeout(() => {
      root.classList.remove('theme-transitioning');
    }, 500);
    return () => clearTimeout(timeout);
  }, [theme, mounted]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  // Prevent flash: inline script in layout.tsx handles initial class, just render children
  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
