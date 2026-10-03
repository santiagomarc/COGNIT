import 'server-only';

/**
 * Whether this deployment can delete accounts (sidebar plan §5.11, D8):
 * SUPABASE_SERVICE_ROLE_KEY is set. Kept apart from `supabase/admin.ts` so
 * the Settings page can ask without importing the service-role client, which
 * only `actions/settings.ts` may do (settings.test.ts pins that).
 */
export function accountDeletionAvailable(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}
