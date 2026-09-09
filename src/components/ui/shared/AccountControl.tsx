'use client';

import { useState } from 'react';
import { AnimatePresence, m, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';

import { logout } from '@/app/auth/actions';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/button';
import { motionTransitions } from '@/lib/motion-configs';
import { useModalDialog } from '@/lib/use-modal-dialog';

type AccountControlProps = {
  /** Shown in the sheet so "sign out" says what it is signing out of. */
  email: string | null;
  /**
   * Rail placement styles the trigger as a rail row, so the label reveals with
   * the column; header placement is a 30px square with no label.
   */
  placement?: 'rail' | 'header';
};

/**
 * The account control (design system §8, task 8.3).
 *
 * This is where the dock's only other live destination went. The dock offered
 * sign-out as an unlabelled icon on a floating bar; it is now a named control
 * inside a sheet that also says which account it will sign out of, next to the
 * theme toggle that used to sit loose in three different page headers.
 *
 * Desktop anchors it in the rail foot, mobile in the header — the same sheet
 * either way, because §8 gives mobile no bottom bar to put it in.
 */
export function AccountControl({ email, placement = 'rail' }: AccountControlProps) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const reduced = useReducedMotion();
  const dialogRef = useModalDialog({ open, onClose: () => setOpen(false) });

  // A letter is a better badge than a glyph (§6), and the icon allowlist has
  // nothing that means "account" without inventing a metaphor.
  const initial = email?.trim()?.[0]?.toUpperCase() ?? '?';

  async function handleSignOut() {
    setSigningOut(true);
    await logout();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label="Account"
        title="Account"
        className={
          placement === 'rail'
            ? 'rail__btn'
            : 'inline-flex size-[30px] shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-[var(--border-control)] text-ink outline-hidden transition-colors duration-[120ms] hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]'
        }
      >
        <span
          aria-hidden="true"
          className={
            placement === 'rail'
              ? 'inline-flex h-[15px] w-[15px] shrink-0 items-center justify-center font-mono text-[11px] leading-none'
              : 'font-mono text-[11px] leading-none'
          }
        >
          {initial}
        </span>
        {placement === 'rail' ? <span className="rail__label">Account</span> : null}
      </button>

      <AnimatePresence>
        {open ? (
          <div className="fixed inset-0 z-[var(--z-modal)] flex items-end justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6 sm:items-center">
            {/* §7.8 scrim — the one permitted blur. */}
            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={reduced ? { duration: 0 } : motionTransitions.panel}
              className="absolute inset-0 z-[var(--z-overlay)] bg-[color-mix(in_srgb,var(--bg)_80%,transparent)] backdrop-blur-[4px]"
              onClick={() => setOpen(false)}
            />

            <m.div
              ref={dialogRef}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={reduced ? { duration: 0 } : motionTransitions.panel}
              className="surface relative z-[var(--z-modal)] w-full max-w-[380px] border-border-strong"
              role="dialog"
              aria-modal="true"
              aria-labelledby="account-sheet-title"
            >
              <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
                <div className="min-w-0 space-y-1">
                  <p className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
                    Signed in as
                  </p>
                  <h2
                    id="account-sheet-title"
                    className="truncate font-mono text-[13px] text-ink"
                    title={email ?? undefined}
                  >
                    {email ?? 'Your account'}
                  </h2>
                </div>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>

              <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
                <span className="text-sm text-ink">Appearance</span>
                <ThemeToggle />
              </div>

              <div className="px-5 py-4">
                <Button
                  type="button"
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className="w-full justify-center"
                >
                  {/* The label is the affordance (§6) — a glyph beside it would
                      be decoration, and this is the one control here that ends
                      a session. */}
                  {signingOut ? 'Signing out…' : 'Sign out'}
                </Button>
              </div>
            </m.div>
          </div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
