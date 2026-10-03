'use client';

import { Switch } from '@/components/ui/switch';
import { useFeedbackPrefs } from '@/lib/use-feedback-prefs';

import { SettingsRow } from './SettingsSection';

/**
 * Settings → Sound & haptics (sidebar plan §5.6, SET-05). The same store the
 * quiz screen's toggles write (`cognit-feedback-prefs` in localStorage), so a
 * change here shows there and the reverse. Per browser by design (D4).
 */
export function FeedbackPrefsControls() {
  const [prefs, setPrefs] = useFeedbackPrefs();

  return (
    <>
      <SettingsRow label="Sound on answer" htmlFor="settings-sound">
        <Switch
          id="settings-sound"
          checked={prefs.sound}
          onCheckedChange={(sound) => setPrefs({ ...prefs, sound })}
        />
      </SettingsRow>
      <SettingsRow
        label="Vibrate on answer"
        htmlFor="settings-haptics"
        hintId="settings-haptics-hint"
        hint="Phones that support it. iPhones don't."
      >
        <Switch
          id="settings-haptics"
          checked={prefs.haptics}
          onCheckedChange={(haptics) => setPrefs({ ...prefs, haptics })}
          aria-describedby="settings-haptics-hint"
        />
      </SettingsRow>
    </>
  );
}
