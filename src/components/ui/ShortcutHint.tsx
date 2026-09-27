'use client';

import { useEffect, useState } from 'react';
import { Kbd } from '@/components/ui/Kbd';

/**
 * A keycap that matches the keyboard in front of the user (plan §5.2,
 * A11Y-10): ⌘ on Apple platforms, Ctrl elsewhere. Decorative — the control
 * carries `aria-keyshortcuts` — so it is hidden from assistive technology.
 * Starts as the Apple form on the server and the first client render, then
 * corrects itself after mount, so hydration never disagrees.
 */
export function ShortcutHint({ apple, other }: { apple: string; other: string }) {
  const [isApple, setIsApple] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setIsApple(/Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent)), 0);
    return () => window.clearTimeout(timer);
  }, []);
  return <Kbd aria-hidden="true">{isApple ? apple : other}</Kbd>;
}
