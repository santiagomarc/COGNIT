'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { resetStudyDefaults, updateStudyDefaults } from '@/app/actions/settings';
import { Button } from '@/components/ui/button';
import { Stepper } from '@/components/ui/stepper';
import { formatActionError } from '@/lib/ai-feedback';
import { MAX_SESSION_CARD_COUNT, MIN_SESSION_CARD_COUNT } from '@/lib/study';
import { DEFAULT_USER_SETTINGS, MAX_NEW_CARDS_PER_SESSION, type StudyDefaults } from '@/lib/user-settings-limits';

import { SettingsRow } from './SettingsSection';

/**
 * Settings → Study (sidebar plan §5.5, SET-04). Two account-wide defaults the
 * study and quiz pages read. A `?count=` in a link still wins, and the session
 * launcher still lets the user pick per session.
 */
export function StudyDefaultsForm({ initial }: { initial: StudyDefaults }) {
  const [values, setValues] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [isPending, startTransition] = useTransition();

  const dirty =
    values.sessionCardCount !== saved.sessionCardCount || values.newCardsPerSession !== saved.newCardsPerSession;
  const atDefaults =
    values.sessionCardCount === DEFAULT_USER_SETTINGS.sessionCardCount &&
    values.newCardsPerSession === DEFAULT_USER_SETTINGS.newCardsPerSession;

  const run = (action: () => ReturnType<typeof updateStudyDefaults>, message: string) =>
    startTransition(async () => {
      const result = await action();
      if (!('success' in result) || !result.success) {
        toast.error(formatActionError('error' in result ? result.error : null, 'Could not save your study defaults.'));
        return;
      }
      const next = { sessionCardCount: result.sessionCardCount, newCardsPerSession: result.newCardsPerSession };
      setValues(next);
      setSaved(next);
      toast.success(message);
    });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (dirty) run(() => updateStudyDefaults(values), 'Saved');
      }}
    >
      <div className="divide-y divide-border">
        <SettingsRow
          label="Cards per session"
          htmlFor="settings-session-cards"
          hintId="settings-session-cards-hint"
          hint={
            <>
              Where a study session or quiz starts, from <span className="font-mono tnum">{MIN_SESSION_CARD_COUNT}</span> to{' '}
              <span className="font-mono tnum">{MAX_SESSION_CARD_COUNT}</span>. You can still change it each time.
            </>
          }
        >
          <Stepper
            id="settings-session-cards"
            value={values.sessionCardCount}
            min={MIN_SESSION_CARD_COUNT}
            max={MAX_SESSION_CARD_COUNT}
            onChange={(sessionCardCount) => setValues((current) => ({ ...current, sessionCardCount }))}
            decrementLabel="Fewer cards"
            incrementLabel="More cards"
            describedBy="settings-session-cards-hint"
            disabled={isPending}
          />
        </SettingsRow>

        <SettingsRow
          label="New cards per session"
          htmlFor="settings-new-cards"
          hintId="settings-new-cards-hint"
          hint={
            <>
              Unseen cards mixed in with your reviews, <span className="font-mono tnum">0</span> to{' '}
              <span className="font-mono tnum">{MAX_NEW_CARDS_PER_SESSION}</span>. When few cards are due, new ones fill the rest
              of the session.
            </>
          }
        >
          <Stepper
            id="settings-new-cards"
            value={values.newCardsPerSession}
            min={0}
            max={MAX_NEW_CARDS_PER_SESSION}
            onChange={(newCardsPerSession) => setValues((current) => ({ ...current, newCardsPerSession }))}
            decrementLabel="Fewer new cards"
            incrementLabel="More new cards"
            describedBy="settings-new-cards-hint"
            disabled={isPending}
          />
        </SettingsRow>
      </div>

      <div className="flex items-center justify-end gap-2 pt-3">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={isPending || atDefaults}
          onClick={() => run(resetStudyDefaults, 'Study defaults reset')}
          className="max-md:h-[44px]"
        >
          Reset to defaults
        </Button>
        <Button type="submit" size="sm" disabled={!dirty || isPending} className="max-md:h-[44px]">
          {isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  );
}
