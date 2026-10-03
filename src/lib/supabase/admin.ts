import 'server-only';
import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';
import { publicEnv } from '@/lib/env-public';

/**
 * The one service-role client in the app (sidebar plan §5.11, SET-10). It
 * exists for a single call — `auth.admin.deleteUser` — because deleting an
 * auth user needs either this key or a SECURITY DEFINER function, and
 * production assertion 2 forbids the latter.
 *
 * It bypasses RLS entirely. Nothing but `deleteAccount` may import it, which
 * the settings test pins; never pass it to a loader or return it from a helper.
 *
 * Null when SUPABASE_SERVICE_ROLE_KEY is unset (`accountDeletionAvailable` in
 * account-deletion.ts asks the same question): Settings then shows account
 * deletion as unavailable instead of offering a button that fails.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;

  return createClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
