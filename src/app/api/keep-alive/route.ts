// src/app/api/keep-alive/route.ts
import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/lib/database.types';
import { publicEnv } from '@/lib/env-public';
import { logger } from '@/lib/logger';

// Force this route to always fetch fresh data, skipping Next.js caching
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;

  // In production, CRON_SECRET must be configured to prevent unauthenticated ping abuse
  if (!cronSecret && process.env.NODE_ENV === 'production') {
    logger.error('keep-alive', 'Rejected request: CRON_SECRET is not configured in production.');
    return NextResponse.json(
      { error: 'Server configuration error: CRON_SECRET is not configured.' },
      { status: 500 }
    );
  }

  // If CRON_SECRET is set (or in production where it is required), require Bearer authorization
  if (cronSecret) {
    const authHeader = request.headers.get('authorization');
    const expectedAuth = `Bearer ${cronSecret}`;
    if (!authHeader || authHeader !== expectedAuth) {
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
    logger.error('keep-alive', 'Query failed', { message: error.message });
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
