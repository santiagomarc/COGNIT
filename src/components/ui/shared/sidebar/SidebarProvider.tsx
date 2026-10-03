'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';

import { SIDEBAR_COOKIE, type SidebarPreference } from '@/lib/sidebar-nav';

type SidebarContextValue = {
  /** `auto` until the user collapses or expands it (sidebar plan §6.2). */
  preference: SidebarPreference;
  setPreference: (next: Exclude<SidebarPreference, 'auto'>) => void;
  /** The phone drawer. Never open at ≥768px. */
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function useSidebar(): SidebarContextValue {
  const value = useContext(SidebarContext);
  if (!value) throw new Error('useSidebar must be used inside SidebarProvider');
  return value;
}

const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * The shell's root (sidebar plan §6.2, NAV-02): renders `.shell` with the
 * sidebar preference on it, so the CSS that sizes the sidebar and the CSS
 * that hides Settings' own index read the same attribute.
 *
 * The preference arrives from the server, which read the `cognit-sidebar`
 * cookie, so the first paint is already right — the reason design system §8
 * once forbade persisting the rail (a reflow after hydration) no longer
 * applies. A choice made here is written back to that cookie.
 */
export function SidebarProvider({
  initialPreference,
  children,
}: {
  initialPreference: SidebarPreference;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [preference, setPreferenceState] = useState<SidebarPreference>(initialPreference);
  /*
   * The drawer remembers the route it belongs to. When the route changes — a
   * link in the drawer, Back, the palette — it closes during that render, the
   * documented way to adjust state to a changed input without an effect, so
   * the new page never paints behind a scrim.
   */
  const [drawer, setDrawer] = useState({ open: false, pathname });
  if (drawer.pathname !== pathname) {
    setDrawer({ open: false, pathname });
  }
  const drawerOpen = drawer.open && drawer.pathname === pathname;

  const setPreference = useCallback((next: Exclude<SidebarPreference, 'auto'>) => {
    setPreferenceState(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
  }, []);

  const openDrawer = useCallback(() => setDrawer((current) => ({ ...current, open: true })), []);
  const closeDrawer = useCallback(() => setDrawer((current) => ({ ...current, open: false })), []);

  // Growing past the phone breakpoint turns the drawer back into a column.
  useEffect(() => {
    const wide = window.matchMedia('(min-width: 768px)');
    const onChange = () => {
      if (wide.matches) closeDrawer();
    };
    wide.addEventListener('change', onChange);
    return () => wide.removeEventListener('change', onChange);
  }, [closeDrawer]);

  const value = useMemo<SidebarContextValue>(
    () => ({ preference, setPreference, drawerOpen, openDrawer, closeDrawer }),
    [preference, setPreference, drawerOpen, openDrawer, closeDrawer],
  );

  return (
    <SidebarContext.Provider value={value}>
      <div className="shell flex min-h-dvh" data-sidebar={preference}>
        {children}
      </div>
    </SidebarContext.Provider>
  );
}
