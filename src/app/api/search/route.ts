import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { searchCardsByText } from '@/lib/card-search';
import { getRequestClient, getSessionUser } from '@/lib/supabase/session';

/**
 * Card search by text, for the command palette as the user types (AI-12).
 * A GET route rather than a Server Action: the palette cancels the previous
 * request on each keystroke, which a Server Action cannot do, and a tab's
 * Server Actions run one at a time (PERF-10).
 */
const querySchema = z.string().trim().min(2).max(200);

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse(request.nextUrl.searchParams.get('q') ?? '');
  if (!parsed.success) {
    return NextResponse.json({ error: 'Type at least two characters.' }, { status: 400 });
  }

  const [supabase, user] = await Promise.all([getRequestClient(), getSessionUser()]);
  if (!user) {
    return NextResponse.json({ error: 'You must be logged in.' }, { status: 401 });
  }

  const outcome = await searchCardsByText(supabase, parsed.data);
  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error }, { status: 500 });
  }
  return NextResponse.json({ results: outcome.results }, { headers: { 'Cache-Control': 'private, no-store' } });
}
