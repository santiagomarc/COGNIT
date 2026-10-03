'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { getAiUsage } from '@/app/actions/settings';
import { logout } from '@/app/auth/actions';
import { Kbd } from '@/components/ui/Kbd';
import { ThemePreferenceControl } from '@/components/ui/shared/ThemePreferenceControl';
import { requestOpenShortcuts } from '@/lib/dashboard-events';

const LABEL = 'font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer';
const ROW =
  'flex h-8 w-full items-center justify-between gap-3 rounded-[var(--radius-control)] px-2.5 text-left text-[13px] text-ink ' +
  'outline-hidden transition-colors duration-[120ms] hover:bg-surface-raised ' +
  'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent)] max-md:h-11';

type Usage = { used: number; ceiling: number } | 'error' | null;

type AccountMenuContentProps = {
  name: string | null;
  email: string | null;
  /** Closes the menu: before a navigation, and before opening another dialog. */
  onClose: () => void;
  titleId: string;
};

/**
 * The account menu's body (sidebar plan §6.6, NAV-06), shared by the desktop
 * popover and the drawer's inline panel. AI usage is read when the menu opens,
 * never on page load: it is the one thing here that costs a query.
 */
export function AccountMenuContent({ name, email, onClose, titleId }: AccountMenuContentProps) {
  const [usage, setUsage] = useState<Usage>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let live = true;
    getAiUsage()
      .then((result) => {
        if (!live) return;
        setUsage('success' in result && result.success ? { used: result.used, ceiling: result.ceiling } : 'error');
      })
      .catch(() => {
        if (live) setUsage('error');
      });
    return () => {
      live = false;
    };
  }, []);

  const openShortcuts = () => {
    onClose();
    // After the menu has closed and returned focus, so the dialog records the right opener.
    requestAnimationFrame(() => requestAnimationFrame(requestOpenShortcuts));
  };

  const signOut = async () => {
    setSigningOut(true);
    await logout();
  };

  const percent = usage && usage !== 'error' ? Math.min(100, Math.round((usage.used / Math.max(1, usage.ceiling)) * 100)) : 0;
  const atLimit = usage && usage !== 'error' ? usage.used >= usage.ceiling : false;

  return (
    <div className="flex flex-col">
      <div className="px-2.5 pb-3 pt-2">
        <p id={titleId} className={LABEL}>
          Signed in as
        </p>
        <p className="mt-0.5 truncate text-sm font-medium text-ink">{name ?? 'Your account'}</p>
        {email ? (
          <p className="truncate font-mono text-[12px] text-ink-dimmer" title={email}>
            {email}
          </p>
        ) : null}
      </div>

      <div className="mx-1 mb-1 h-px bg-border" />
      <ul className="flex flex-col">
        <li>
          <Link href="/dashboard/settings#profile" className={ROW} onClick={onClose}>
            Profile
          </Link>
        </li>
        <li>
          <Link href="/dashboard/settings" className={ROW} onClick={onClose}>
            Settings
          </Link>
        </li>
        <li>
          <button type="button" className={ROW} onClick={openShortcuts} aria-haspopup="dialog">
            Keyboard shortcuts
            <Kbd>?</Kbd>
          </button>
        </li>
      </ul>

      <div className="m-1 h-px bg-border" />
      <div className="flex items-center justify-between gap-3 px-2.5 py-1.5">
        <span className="text-[13px] text-ink">Theme</span>
        <ThemePreferenceControl />
      </div>

      <div className="m-1 h-px bg-border" />
      <div className="px-2.5 pb-2.5 pt-1.5">
        <div className="flex items-baseline justify-between">
          <span className="text-[12px] text-ink-dim">AI calls, last 24 hours</span>
          {usage === null ? (
            <span className="glass-skeleton block h-3 w-14 rounded-sm" aria-hidden="true" />
          ) : usage === 'error' ? (
            <span className="text-[12px] text-ink-dim">Usage unavailable</span>
          ) : (
            <span className="font-mono text-[12px] tnum">
              <span className={atLimit ? 'text-destructive' : 'text-ink'}>{usage.used}</span>
              <span className="text-ink-dimmer"> / {usage.ceiling}</span>
            </span>
          )}
        </div>
        {usage && usage !== 'error' ? (
          <div
            role="meter"
            aria-label="AI calls used in the last 24 hours"
            aria-valuemin={0}
            aria-valuemax={usage.ceiling}
            aria-valuenow={Math.min(usage.used, usage.ceiling)}
            className="mt-1.5 h-1 overflow-hidden rounded-[2px] bg-surface-raised"
          >
            <span
              className="block h-full"
              style={{ width: `${percent}%`, backgroundColor: atLimit ? 'var(--destructive)' : 'var(--ink-dim)' }}
            />
          </div>
        ) : null}
      </div>

      <div className="mx-1 mt-0 mb-1 h-px bg-border" />
      <button type="button" className={ROW} onClick={signOut} disabled={signingOut}>
        {signingOut ? 'Signing out…' : 'Sign out'}
      </button>
    </div>
  );
}
