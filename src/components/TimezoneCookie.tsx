'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { TZ_COOKIE } from '@/lib/timezone';

/**
 * Tells the server the browser's time zone (UIUX plan UX-06). On mount it
 * compares the zone with the `cognit-tz` cookie; if they differ it writes the
 * cookie and refreshes once. The first visit renders in UTC and corrects
 * itself; every later one is right on the first byte, and a user who travels
 * is corrected the same way.
 *
 * Bundled code rather than an inline script, so the CSP is untouched.
 */
export function TimezoneCookie() {
  const router = useRouter();

  useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!zone) return;
    const current = document.cookie
      .split('; ')
      .find((entry) => entry.startsWith(`${TZ_COOKIE}=`))
      ?.slice(TZ_COOKIE.length + 1);
    if (current && decodeURIComponent(current) === zone) return;
    document.cookie = `${TZ_COOKIE}=${encodeURIComponent(zone)}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }, [router]);

  return null;
}
