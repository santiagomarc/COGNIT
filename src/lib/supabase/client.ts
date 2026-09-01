import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/lib/database.types';
import { publicEnv } from '@/lib/env-public';

// This client runs in the BROWSER (Client Component)
// Used for: Login forms, real-time subscriptions, client-side auth checks
export function createClient() {
  return createBrowserClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
