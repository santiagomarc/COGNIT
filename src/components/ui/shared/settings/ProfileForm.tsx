'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { updateDisplayName } from '@/app/actions/settings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatActionError } from '@/lib/ai-feedback';
import { DISPLAY_NAME_MAX } from '@/lib/user-settings-limits';

import { SettingsRow } from './SettingsSection';

type ProfileFormProps = {
  /** The saved name, or null when the greeting derives one. */
  displayName: string | null;
  /** What the greeting shows with no saved name — the input's placeholder. */
  derivedName: string | null;
  email: string | null;
};

/**
 * Settings → Profile (sidebar plan §5.2, SET-01). One field with an explicit
 * Save (design system §7.12): a name is a deliberate edit, not something to
 * write on every keystroke. Saving an empty field returns the greeting to the
 * derived name.
 */
export function ProfileForm({ displayName, derivedName, email }: ProfileFormProps) {
  const [value, setValue] = useState(displayName ?? '');
  const [saved, setSaved] = useState(displayName ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const dirty = value.trim() !== saved.trim();

  const save = () =>
    startTransition(async () => {
      setError(null);
      const result = await updateDisplayName(value);
      if (!('success' in result) || !result.success) {
        setError(formatActionError('error' in result ? result.error : null, 'Could not save your name.'));
        return;
      }
      const next = result.displayName ?? '';
      setValue(next);
      setSaved(next);
      toast.success(next ? 'Saved' : 'Saved. Your greeting uses your account name again.');
    });

  return (
    <>
      <SettingsRow
        label="Display name"
        htmlFor="settings-display-name"
        hintId="settings-display-name-hint"
        hint="Shown in your greeting. Leave it empty to use your account name."
      >
        <form
          className="flex items-start gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (dirty) save();
          }}
        >
          <div className="w-full md:w-[280px]">
            <Input
              id="settings-display-name"
              name="displayName"
              autoComplete="nickname"
              maxLength={DISPLAY_NAME_MAX * 2}
              placeholder={derivedName ?? 'Your name'}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'settings-display-name-hint settings-display-name-error' : 'settings-display-name-hint'}
              className="h-[34px] max-md:h-[44px]"
            />
            <p id="settings-display-name-error" aria-live="polite" className="mt-1 text-[12px] text-destructive empty:hidden">
              {error ?? ''}
            </p>
          </div>
          <Button type="submit" size="sm" disabled={!dirty || isPending} className="max-md:h-[44px]">
            {isPending ? 'Saving…' : 'Save'}
          </Button>
        </form>
      </SettingsRow>

      <SettingsRow label="Email" hint="The address you sign in with.">
        <span className="font-mono text-[13px] text-ink-dim">{email ?? 'No email on this account'}</span>
      </SettingsRow>
    </>
  );
}
