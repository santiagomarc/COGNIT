'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';

/**
 * Confirms a deleted account on arrival (sidebar plan §5.11, SET-10):
 * `deleteAccount` redirects to `/?account=deleted`. Read from `location` in an
 * effect rather than `useSearchParams`, so the landing page stays static and
 * needs no Suspense boundary for one flag. The flag is removed from the URL
 * so a reload or a shared link does not repeat the message.
 */
export function AccountDeletedNotice() {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('account') !== 'deleted') return;

    toast.success('Your account and everything in it has been deleted.');
    url.searchParams.delete('account');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }, []);

  return null;
}
