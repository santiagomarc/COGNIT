'use client';

import { useTheme } from '@/components/ThemeProvider';
import { Sun, Moon } from 'lucide-react';
import { motion } from 'framer-motion';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <motion.button
      onClick={toggleTheme}
      className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-primary/20 bg-card/60 text-foreground shadow-[0_8px_24px_-18px_var(--shadow-base)] backdrop-blur-md transition-[background-color,border-color,box-shadow,transform] duration-300 hover:bg-card/80 hover:shadow-[0_10px_28px_-18px_var(--glow)]"
      whileTap={{ scale: 0.9 }}
      whileHover={{ scale: 1.05 }}
      transition={{ type: 'spring', stiffness: 320, damping: 24 }}
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
    >
      <motion.span
        aria-hidden="true"
        className="absolute inset-0 rounded-lg bg-primary/10"
        initial={false}
        animate={{ opacity: isDark ? 0.45 : 0.18, scale: isDark ? 1 : 0.92 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      />

      <span className="relative h-4 w-4">
        <motion.span
          className="absolute inset-0"
          initial={false}
          animate={{
            opacity: isDark ? 1 : 0,
            rotate: isDark ? 0 : -70,
            scale: isDark ? 1 : 0.65,
            y: isDark ? 0 : 1,
          }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          <Moon className="h-4 w-4" />
        </motion.span>
        <motion.span
          className="absolute inset-0"
          initial={false}
          animate={{
            opacity: isDark ? 0 : 1,
            rotate: isDark ? 70 : 0,
            scale: isDark ? 0.65 : 1,
            y: isDark ? -1 : 0,
          }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          <Sun className="h-4 w-4" />
        </motion.span>
      </span>
    </motion.button>
  );
}
