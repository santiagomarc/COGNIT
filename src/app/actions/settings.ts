'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { resetPassword } from '@/app/auth/actions';
import { guardAction } from '@/lib/action-guard';
import { aiUsageReading } from '@/lib/ai-usage';
import { logger } from '@/lib/logger';
import { sanitizeDatabaseError } from '@/lib/server-errors';
import { createAdminClient } from '@/lib/supabase/admin';
import { getRequestClient, getSessionUser } from '@/lib/supabase/session';
import { DEFAULT_USER_SETTINGS, displayNameSchema, studyDefaultsSchema, type StudyDefaults } from '@/lib/user-settings';

/*
 * Settings (sidebar plan §5). Account-scoped values go to `user_settings`
 * (202610010900) through its owner policies; nothing here needs more than
 * the caller's own session, except deleteAccount, which is the only user of
 * the service-role client.
 */

async function signedIn() {
  const [supabase, user] = await Promise.all([getRequestClient(), getSessionUser()]);
  return user ? { supabase, user } : null;
}

function firstIssue(issues: { message: string }[], fallback: string): string {
  return issues[0]?.message ?? fallback;
}

/** Everything that renders the name or the defaults sits under the dashboard layout. */
function revalidateShell() {
  revalidatePath('/dashboard', 'layout');
}

export async function updateDisplayName(raw: string) {
  return guardAction('Display name', async () => {
    const parsed = displayNameSchema.safeParse(typeof raw === 'string' ? raw : '');
    if (!parsed.success) return { error: firstIssue(parsed.error.issues, 'That name cannot be used.') };

    const session = await signedIn();
    if (!session) return { error: 'You must be logged in.' };

    // PostgREST's upsert writes only the columns sent, so the study defaults survive.
    const { error } = await session.supabase
      .from('user_settings')
      .upsert(
        { user_id: session.user.id, display_name: parsed.data, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      );
    if (error) return { error: sanitizeDatabaseError(error, 'Could not save your name.') };

    revalidateShell();
    return { success: true as const, displayName: parsed.data };
  });
}

export async function updateStudyDefaults(input: StudyDefaults) {
  return guardAction('Study defaults', async () => {
    const parsed = studyDefaultsSchema.safeParse(input);
    if (!parsed.success) return { error: firstIssue(parsed.error.issues, 'Those values are out of range.') };

    const session = await signedIn();
    if (!session) return { error: 'You must be logged in.' };

    const { error } = await session.supabase
      .from('user_settings')
      .upsert(
        {
          user_id: session.user.id,
          session_card_count: parsed.data.sessionCardCount,
          new_cards_per_session: parsed.data.newCardsPerSession,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );
    if (error) return { error: sanitizeDatabaseError(error, 'Could not save your study defaults.') };

    revalidateShell();
    return { success: true as const, ...parsed.data };
  });
}

export async function resetStudyDefaults() {
  return updateStudyDefaults({
    sessionCardCount: DEFAULT_USER_SETTINGS.sessionCardCount,
    newCardsPerSession: DEFAULT_USER_SETTINGS.newCardsPerSession,
  });
}

/** Read on demand by the account menu and Settings, never by the shell on every navigation. */
export async function getAiUsage() {
  return guardAction('AI usage', async () => {
    const session = await signedIn();
    if (!session) return { error: 'You must be logged in.' };

    const { data, error } = await session.supabase.rpc('get_ai_usage_summary');
    if (error) return { error: sanitizeDatabaseError(error, 'Could not read your AI usage.') };

    const reading = aiUsageReading(data?.[0] ?? null);
    return {
      success: true as const,
      used: reading.used,
      ceiling: reading.ceiling,
      nextFreesAt: reading.nextFreesAt?.toISOString() ?? null,
    };
  });
}

/** Only for accounts that sign in with a password; OAuth accounts have none to reset. */
export async function sendPasswordResetLink() {
  return guardAction('Password reset', async () => {
    const session = await signedIn();
    if (!session) return { error: 'You must be logged in.' };
    if (!session.user.email || !session.user.providers.includes('email')) {
      return { error: 'This account signs in without a password.' };
    }
    const result = await resetPassword({ email: session.user.email });
    return 'error' in result && result.error ? { error: result.error } : { success: true as const };
  });
}

/**
 * Revokes every refresh token for the account, this browser's included.
 * Not wrapped in guardAction: `redirect` works by throwing, and the guard
 * would catch it — the same reason `logout` is unwrapped.
 */
export async function signOutEverywhere() {
  const supabase = await getRequestClient();
  const { error } = await supabase.auth.signOut({ scope: 'global' });
  if (error) logger.warn('auth', 'global sign-out failed', { message: error.message });
  revalidatePath('/', 'layout');
  redirect('/login');
}

/**
 * Deletes the auth user; every public table cascades from auth.users (checked
 * by production assertion 18 before this ships). The confirmation is the
 * account's email, typed — a button alone is one mis-click from gone.
 */
export async function deleteAccount(input: { confirmation: string }) {
  const result = await guardAction('Account delete', async () => {
    const session = await signedIn();
    if (!session) return { error: 'You must be logged in.' };

    const expected = (session.user.email ?? 'delete my account').trim().toLowerCase();
    const typed = typeof input?.confirmation === 'string' ? input.confirmation.trim().toLowerCase() : '';
    if (typed !== expected) return { error: 'That does not match. Nothing was deleted.' };

    const admin = createAdminClient();
    if (!admin) return { error: 'Account deletion is not available right now.' };

    const { error } = await admin.auth.admin.deleteUser(session.user.id);
    if (error) {
      logger.error('account', 'deleteUser failed', { message: error.message });
      return { error: 'Your account was not deleted. Please try again.' };
    }

    logger.info('account', 'account deleted', { user_id: session.user.id });
    return { success: true as const };
  });

  if ('success' in result && result.success) {
    // The user is gone; clearing this browser's cookies is all that is left.
    const supabase = await getRequestClient();
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
    revalidatePath('/', 'layout');
    redirect('/?account=deleted');
  }

  return result;
}
