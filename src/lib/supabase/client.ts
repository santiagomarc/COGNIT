import { createBrowserClient } from '@supabase/ssr';

// This client runs in the BROWSER (Client Component)
// Used for: Login forms, real-time subscriptions, client-side auth checks
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
