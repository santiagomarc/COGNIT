'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { sendPasswordResetLink, signOutEverywhere } from '@/app/actions/settings';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/shared/ConfirmDialog';
import { formatActionError } from '@/lib/ai-feedback';
import { hasPassword, providerLine } from '@/lib/auth-providers';

import { SettingsRow } from './SettingsSection';

/**
 * Settings → Sign-in & security (sidebar plan §5.3, SET-02). The password row
 * only exists for an account that has a password (the `email` provider): an
 * OAuth-only account has none to reset.
 */
export function SecurityControls({ providers }: { providers: string[] }) {
  const [confirming, setConfirming] = useState(false);
  const [isSending, startSending] = useTransition();
  const [isSigningOut, startSigningOut] = useTransition();

  const sendReset = () =>
    startSending(async () => {
      const result = await sendPasswordResetLink();
      if (!('success' in result) || !result.success) {
        toast.error(formatActionError('error' in result ? result.error : null, 'Could not send the link.'));
        return;
      }
      toast.success('Check your email for a reset link.');
    });

  // signOutEverywhere redirects to /login when it succeeds, so there is no success branch here.
  const signOutAll = () =>
    startSigningOut(async () => {
      await signOutEverywhere();
    });

  return (
    <>
      <SettingsRow label="Signed in with" hint="How you sign in to Cognit.">
        <span className="text-[13px] text-ink-dim">{providerLine(providers)}</span>
      </SettingsRow>

      {hasPassword(providers) ? (
        <SettingsRow label="Password" hint="We'll email you a link to set a new one.">
          <Button type="button" size="sm" onClick={sendReset} disabled={isSending} className="max-md:h-[44px]">
            {isSending ? 'Sending…' : 'Send reset link'}
          </Button>
        </SettingsRow>
      ) : null}

      <SettingsRow label="Sessions" hint="Sign out on every browser and device.">
        <Button type="button" size="sm" onClick={() => setConfirming(true)} disabled={isSigningOut} className="max-md:h-[44px]">
          Sign out everywhere
        </Button>
      </SettingsRow>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Sign out everywhere?"
        description="This signs you out on every browser and device, including this one."
        confirmLabel="Sign out everywhere"
        loading={isSigningOut}
        onConfirm={signOutAll}
      />
    </>
  );
}
