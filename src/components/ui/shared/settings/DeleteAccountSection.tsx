'use client';

import { useCallback, useState, useTransition } from 'react';
import { AnimatePresence, m, useReducedMotion } from 'framer-motion';

import { deleteAccount } from '@/app/actions/settings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatActionError } from '@/lib/ai-feedback';
import { motionTransitions } from '@/lib/motion-configs';
import { useModalDialog } from '@/lib/use-modal-dialog';

type DeleteAccountSectionProps = {
  /** SUPABASE_SERVICE_ROLE_KEY is set on this deployment (D8). */
  available: boolean;
  email: string | null;
  deckCount: number;
  sharedCount: number;
};

/** What the user must type: the account's email, or this phrase for an account without one. */
const FALLBACK_PHRASE = 'delete my account';

function normalize(value: string) {
  return value.trim().toLowerCase();
}

/**
 * Settings → Delete account (sidebar plan §5.11, SET-10).
 *
 * The confirmation is the account's email, typed: a button alone is one
 * mis-click from losing everything. The server checks the same thing again
 * (`deleteAccount`), so this dialog is a courtesy, not the gate.
 *
 * Without the service-role key the section says so and shows no button,
 * which is also the state of every preview deployment (D8).
 */
export function DeleteAccountSection({ available, email, deckCount, sharedCount }: DeleteAccountSectionProps) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const reduced = useReducedMotion();

  const close = useCallback(() => {
    if (isPending) return;
    setOpen(false);
    setTyped('');
    setError(null);
  }, [isPending]);

  const dialogRef = useModalDialog({
    open,
    onClose: close,
    // Cancel, not the field: Enter on a freshly opened destructive dialog must not reach "Delete".
    initialFocus: (dialog) => dialog.querySelector<HTMLButtonElement>('[data-cancel]'),
  });

  const phrase = email ?? FALLBACK_PHRASE;
  const matches = normalize(typed) === normalize(phrase);

  const submit = () =>
    startTransition(async () => {
      setError(null);
      // On success the action redirects to /?account=deleted, so it only ever returns a failure.
      const result = await deleteAccount({ confirmation: typed });
      if (result && 'error' in result && result.error) {
        setError(formatActionError(result.error, 'Your account was not deleted. Please try again.'));
      }
    });

  if (!available) {
    return <p className="py-3 text-[13px] text-ink-dim">Account deletion isn&rsquo;t available yet.</p>;
  }

  return (
    <>
      <div className="flex flex-col gap-3 py-3 md:flex-row md:items-center md:justify-between md:gap-6">
        <p className="max-w-[420px] text-[13px] leading-[1.55] text-ink-dim">
          Deletes your decks, cards, review history and drills. Shared links stop working. This can&rsquo;t be undone.
        </p>
        <Button
          type="button"
          size="sm"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          className="shrink-0 border-[var(--destructive)] text-destructive hover:bg-transparent hover:text-destructive max-md:h-[44px]"
        >
          Delete account…
        </Button>
      </div>

      <AnimatePresence>
        {open ? (
          <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center">
            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={reduced ? { duration: 0 } : motionTransitions.panel}
              onClick={close}
              className="absolute inset-0 z-[var(--z-overlay)] bg-[color-mix(in_srgb,var(--bg)_80%,transparent)] backdrop-blur-[4px]"
            />
            <m.div
              ref={dialogRef}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="delete-account-title"
              aria-describedby="delete-account-body"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={reduced ? { duration: 0 } : motionTransitions.panel}
              className="panel relative z-[var(--z-modal)] mx-4 w-full max-w-[480px] p-6"
            >
              <h2 id="delete-account-title" className="text-base font-semibold tracking-[-.015em] text-ink">
                Delete your account?
              </h2>
              <div id="delete-account-body" className="mt-2 space-y-2 text-[13px] leading-[1.55] text-ink-dim">
                <p>
                  This deletes <span className="font-mono tnum text-ink">{deckCount}</span> {deckCount === 1 ? 'deck' : 'decks'}{' '}
                  with every card, review, quiz and drill in them
                  {sharedCount > 0 ? (
                    <>
                      , and turns off <span className="font-mono tnum text-ink">{sharedCount}</span> shared{' '}
                      {sharedCount === 1 ? 'link' : 'links'}
                    </>
                  ) : null}
                  . It can&rsquo;t be undone.
                </p>
              </div>

              <form
                className="mt-4 space-y-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (matches && !isPending) submit();
                }}
              >
                <label htmlFor="delete-account-confirm" className="block text-[13px] text-ink">
                  Type <span className="font-mono">{phrase}</span> to confirm
                </label>
                <Input
                  id="delete-account-confirm"
                  autoComplete="off"
                  spellCheck={false}
                  value={typed}
                  onChange={(event) => setTyped(event.target.value)}
                  aria-invalid={error ? true : undefined}
                  aria-describedby="delete-account-error"
                />
                <p id="delete-account-error" role="alert" className="text-[12px] text-destructive empty:hidden">
                  {error ?? ''}
                </p>

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="ghost" data-cancel onClick={close} disabled={isPending}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="destructive" disabled={!matches || isPending}>
                    {isPending ? 'Deleting…' : 'Delete account'}
                  </Button>
                </div>
              </form>
            </m.div>
          </div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
