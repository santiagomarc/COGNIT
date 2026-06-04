// src/app/api/keep-alive/route.ts
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// Force this route to always fetch fresh data, skipping Next.js caching
export const dynamic = 'force-dynamic';

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Safety check to ensure production environment keys are loaded
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { error: 'Database environment configuration missing.' },
      { status: 500 }
    );
  }

  // Initialize a direct Supabase client using public keys
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  // Execute a minimal read operation to register query activity
  const { error } = await supabase
    .from('decks')
    .select('id')
    .limit(1);

  if (error) {
    console.error('[keep-alive] Query failed:', error.message);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { success: true, timestamp: new Date().toISOString() },
    { status: 200 }
  );
}