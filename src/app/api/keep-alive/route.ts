// src/app/api/keep-alive/route.ts
import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/lib/database.types';
import { publicEnv } from '@/lib/env-public';

// Force this route to always fetch fresh data, skipping Next.js caching
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // If CRON_SECRET is configured, require it — keeps this world-callable
  // endpoint from being pinged by anyone who finds the URL. Optional so
  // existing deployments that haven't set the secret yet keep working.
  // Read directly (not validated at import time): this route has nothing to
  // do with AI, so it must never be coupled to GEMINI_API_KEY being present.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  // Initialize a direct Supabase client using public keys
  const supabase = createClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  // Execute a minimal read operation to register query activity.
  // RLS on `decks` means an anon (unauthenticated) client always gets an
  // empty result set here — this never reads another user's data.
  const { error } = await supabase
    .from('decks')
    .select('id')
    .limit(1);

  if (error) {
    // Log server-side only — never echo raw database error text to the caller.
    console.error('[keep-alive] Query failed:', error.message);
    return NextResponse.json(
      { success: false, error: 'Database ping failed.' },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { success: true, timestamp: new Date().toISOString() },
    { status: 200 }
  );
}
