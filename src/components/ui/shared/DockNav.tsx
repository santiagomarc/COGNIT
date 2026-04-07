'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Layers, Brain, UserRound, LogOut } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { logout } from '@/app/auth/actions';
import { motionSprings } from '@/lib/motion-configs';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: Layers },
  { href: '/dashboard/stats', label: 'Stats', icon: Brain, disabled: true },
  { href: '/dashboard/profile', label: 'Profile', icon: UserRound, disabled: true },
];

export function DockNav() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(true);
  const lastYRef = useRef(0);
  const [loggingOut, setLoggingOut] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    const onScroll = () => {
      const currentY = window.scrollY;
      const delta = currentY - lastYRef.current;

      if (currentY < 20) {
        setVisible(true);
      } else if (Math.abs(delta) >= 6 && delta > 0) {
        setVisible(false);
      } else if (Math.abs(delta) >= 6) {
        setVisible(true);
      }

      lastYRef.current = currentY;
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  async function handleLogout() {
    setLoggingOut(true);
    await logout();
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.nav
          initial={{ opacity: 0, y: 30, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.95 }}
          transition={prefersReducedMotion ? { duration: 0 } : motionSprings.dock}
          className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 z-50 w-[calc(100%-1.25rem)] max-w-fit -translate-x-1/2"
          aria-label="Primary navigation"
        >
          <div className="glass-card mx-auto flex items-center gap-1 rounded-2xl border border-primary/20 px-2 py-2 shadow-2xl">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.href === '/dashboard'
                ? pathname === '/dashboard' || pathname.startsWith('/dashboard/')
                : pathname === item.href;

              if (item.disabled) {
                return (
                  <button
                    key={item.href}
                    type="button"
                    disabled
                    className="relative inline-flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground/50"
                    aria-label={`${item.label} (coming soon)`}
                    title={`${item.label} (coming soon)`}
                  >
                    <Icon className="h-5 w-5" />
                  </button>
                );
              }

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="relative inline-flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={item.label}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {isActive && (
                    <motion.span
                      layoutId="dock-active"
                      className="absolute inset-0 rounded-xl border border-primary/30 bg-primary/10 shadow-[0_0_14px_-6px_var(--glow)]"
                      transition={prefersReducedMotion ? { duration: 0 } : motionSprings.activePill}
                    />
                  )}
                  <Icon className="relative z-10 h-5 w-5" />
                </Link>
              );
            })}

            {/* Divider */}
            <div className="mx-0.5 h-6 w-px bg-primary/15" />

            {/* Logout */}
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="relative inline-flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:text-destructive hover:bg-destructive/10 disabled:opacity-50"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="relative z-10 h-5 w-5" />
            </button>
          </div>
        </motion.nav>
      )}
    </AnimatePresence>
  );
}
