import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { SharedDeckList } from '@/components/ui/shared/SharedDeckList';
import { ShortcutsTable } from '@/components/ui/shared/ShortcutsTable';
import { ThemePreferenceControl } from '@/components/ui/shared/ThemePreferenceControl';
import { AiUsageMeter } from '@/components/ui/shared/settings/AiUsageMeter';
import { DeleteAccountSection } from '@/components/ui/shared/settings/DeleteAccountSection';
import { FeedbackPrefsControls } from '@/components/ui/shared/settings/FeedbackPrefsControls';
import { ProfileForm } from '@/components/ui/shared/settings/ProfileForm';
import { SecurityControls } from '@/components/ui/shared/settings/SecurityControls';
import { SettingsIndex } from '@/components/ui/shared/settings/SettingsIndex';
import { SettingsRow, SettingsSection } from '@/components/ui/shared/settings/SettingsSection';
import { StudyDefaultsForm } from '@/components/ui/shared/settings/StudyDefaultsForm';
import { accountDeletionAvailable } from '@/lib/account-deletion';
import { aiUsageReading } from '@/lib/ai-usage';
import { resolveDisplayName } from '@/lib/display-name';
import { logger } from '@/lib/logger';
import { loadSharedDecks } from '@/lib/sharing';
import { loadShellNav } from '@/lib/shell-nav';
import { getRequestClient, getRequestNow, getSessionUser, getUserSettings } from '@/lib/supabase/session';

export const metadata: Metadata = {
  title: 'Settings - Cognit',
};

const LINK =
  'rounded-[var(--radius-sm)] text-[13px] text-ink underline underline-offset-[3px] outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]';

/**
 * Settings (sidebar plan §5, SET-00…SET-10): one scrolling page with anchored
 * sections (D5), in SETTINGS_SECTIONS order so the index — and, in Phase 3,
 * the sidebar — lists them as they appear.
 *
 * Account-scoped values come from `user_settings` (D4); theme and sound are
 * per browser and say so. A management screen: no `.raised`, no primary
 * button (design system §1b and §7.2, Rev. E).
 */
export default async function SettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  const supabase = await getRequestClient();
  const now = getRequestNow();

  const [settings, shell, sharedDecks, usageResult, countsResult] = await Promise.all([
    getUserSettings(user.id),
    loadShellNav(user.id),
    loadSharedDecks(supabase, user.id, now),
    supabase.rpc('get_ai_usage_summary'),
    supabase.rpc('get_sidebar_counts'),
  ]);

  if (usageResult.error) logger.error('settings', 'get_ai_usage_summary failed', { message: usageResult.error.message });
  if (countsResult.error) logger.error('settings', 'get_sidebar_counts failed', { message: countsResult.error.message });

  const usage = aiUsageReading(usageResult.data?.[0] ?? null);
  const trashed = countsResult.data?.[0]?.trashed_count ?? 0;
  const deckCount = shell.decks.length;
  const exploreEnabled = process.env.EXPLORE_ENABLED === 'true';

  return (
    <div className="container mx-auto flex max-w-[1000px] flex-col p-4 md:px-8 md:py-6">
      <header className="pb-4">
        <h1 className="font-serif type-display leading-[1.08] tracking-[-0.02em] text-ink">Settings</h1>
        <p className="mt-1.5 text-[13px] text-ink-dim">Your account, how Cognit looks, and how your sessions run.</p>
        <SettingsIndex />
      </header>

      <SettingsSection id="profile" title="Profile" description="How you appear in Cognit.">
        <ProfileForm displayName={settings.displayName} derivedName={resolveDisplayName(user)} email={user.email} />
      </SettingsSection>

      <SettingsSection id="security" title="Sign-in & security" description="Your password and where you're signed in.">
        <SecurityControls providers={user.providers} />
      </SettingsSection>

      <SettingsSection id="appearance" title="Appearance" description="Saved to this browser.">
        <SettingsRow label="Theme" hint="System follows your device's light or dark setting.">
          <ThemePreferenceControl />
        </SettingsRow>
        <SettingsRow label="Motion" hint="Cognit follows your system's Reduce motion setting.">
          <span className="text-[13px] text-ink-dim">System</span>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection
        id="study"
        title="Study"
        description="Defaults for every study session and quiz, on every device you sign in on."
      >
        <StudyDefaultsForm
          initial={{ sessionCardCount: settings.sessionCardCount, newCardsPerSession: settings.newCardsPerSession }}
        />
      </SettingsSection>

      <SettingsSection
        id="sound"
        title="Sound & haptics"
        description="Feedback when you answer a quiz question. Saved to this browser."
      >
        <FeedbackPrefsControls />
      </SettingsSection>

      <SettingsSection id="shortcuts" title="Keyboard shortcuts" description="They work whenever you're not typing in a field.">
        <ShortcutsTable className="py-3" />
      </SettingsSection>

      <SettingsSection
        id="ai"
        title="AI usage & privacy"
        description="Card generation, hints, deck chat, search and drill checks each use calls."
      >
        <SettingsRow label="Used in the last 24 hours" hint="Calls stop counting 24 hours after they're made.">
          <AiUsageMeter
            used={usage.used}
            ceiling={usage.ceiling}
            nextFreesAt={usage.nextFreesAt ? usage.nextFreesAt.toISOString() : null}
          />
        </SettingsRow>
        <div className="py-3">
          <p className="well px-4 py-3 text-[13px] leading-[1.55] text-ink-dim">
            Cognit uses Google Gemini on its free tier. On that tier, Google may use what you send to improve its
            products, so don&rsquo;t upload anything confidential.
          </p>
        </div>
      </SettingsSection>

      <SettingsSection id="sharing" title="Sharing" description="Decks anyone with the link can open and copy.">
        <div className="py-3">
          <SharedDeckList decks={sharedDecks} exploreEnabled={exploreEnabled} />
          {sharedDecks.length > 0 ? (
            <p className="mt-2 text-right">
              <Link href="/dashboard/shared" className={LINK}>
                All shared decks →
              </Link>
            </p>
          ) : null}
        </div>
      </SettingsSection>

      <SettingsSection id="data" title="Export & trash" description="Take your cards with you, or get a deleted deck back.">
        <SettingsRow
          label="Export all decks"
          hint={
            deckCount > 0 ? (
              <>
                All <span className="font-mono tnum">{deckCount}</span> {deckCount === 1 ? 'deck' : 'decks'} in one file.
              </>
            ) : (
              'You have no decks to export yet.'
            )
          }
        >
          {deckCount > 0 ? (
            <span className="flex gap-2">
              <Button asChild size="sm" className="max-md:h-[44px]">
                <a href="/api/export?format=csv" download>
                  CSV
                </a>
              </Button>
              <Button asChild size="sm" className="max-md:h-[44px]">
                <a href="/api/export?format=anki" download>
                  Anki
                </a>
              </Button>
            </span>
          ) : null}
        </SettingsRow>
        <SettingsRow
          label="Trash"
          hint={
            trashed > 0 ? (
              <>
                <span className="font-mono tnum">{trashed}</span> {trashed === 1 ? 'deck' : 'decks'} in the trash.
              </>
            ) : (
              'The trash is empty.'
            )
          }
        >
          <Button asChild size="sm" className="max-md:h-[44px]">
            <Link href="/dashboard/trash">Open trash</Link>
          </Button>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection id="delete" title="Delete account" description="Permanent.">
        <DeleteAccountSection
          available={accountDeletionAvailable()}
          email={user.email}
          deckCount={deckCount}
          sharedCount={sharedDecks.length}
        />
      </SettingsSection>
    </div>
  );
}
