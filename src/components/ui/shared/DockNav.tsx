'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { m, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Layers, Brain, UserRound, LogOut } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { logout } from '@/app/auth/actions';
import { motionTransitions } from '@/lib/motion-configs';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: Layers },
  { href: '/dashboard/stats', label: 'Stats', icon: Brain, disabled: true },
  { href: '/dashboard/profile', label: 'Profile', icon: UserRound, disabled: true },
];

/*
 * Study and quiz are focus routes: the design system (§8) gives them no
 * navigation chrome at all. Beyond the visual argument, the dock's Dashboard
 * link is a plain <Link> that bypasses the quiz's requestQuit() guard, so
 * leaving it mounted here is what let a paused quiz be abandoned silently.
 */
const CHROMELESS_ROUTE = /\/dashboard\/[^/]+\/(study|quiz)\/?$/;

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

  // Placed after every hook so the hook order stays stable across routes.
  if (CHROMELESS_ROUTE.test(pathname)) return null;

  return (
    <AnimatePresence>
      {visible && (
        <m.nav
          initial={{ opacity: 0, y: 30, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.95 }}
          transition={prefersReducedMotion ? { duration: 0 } : motionTransitions.panel}
          className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 z-[var(--z-rail)] w-[calc(100%-1.25rem)] max-w-fit -translate-x-1/2"
          aria-label="Primary navigation"
        >
          <div className="surface mx-auto flex items-center gap-1 rounded-2xl border border-border-strong px-2 py-2 shadow-2xl">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.href === '/dashboard'
                ? pathname === '/dashboard'
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
                    <m.span
                      layoutId="dock-active"
                      className="absolute inset-0 rounded-xl border border-border-strong bg-primary/10"
                      transition={prefersReducedMotion ? { duration: 0 } : motionTransitions.focusTravel}
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
        </m.nav>
      )}
    </AnimatePresence>
  );
}
