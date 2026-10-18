import { NextResponse, type NextRequest } from 'next/server';
import { semanticSearchSchema } from '@/lib/schemas';
import { searchCardsByMeaning } from '@/lib/card-search';
import { guardAction } from '@/lib/action-guard';
import { getRequestClient, getSessionUser } from '@/lib/supabase/session';

/**
 * Card search by meaning, the palette's explicit "Search by meaning" row
 * (AI-12). A cancellable GET outside the Server Action queue, like
 * /api/search. It spends an AI reservation unless the query's embedding is
 * cached (src/lib/query-embedding-cache.ts).
 */
export async function GET(request: NextRequest) {
  const parsed = semanticSearchSchema.safeParse({ query: request.nextUrl.searchParams.get('q') ?? '' });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Search query is invalid.' }, { status: 400 });
  }

  const [supabase, user] = await Promise.all([getRequestClient(), getSessionUser()]);
  if (!user) {
    return NextResponse.json({ error: 'You must be logged in.' }, { status: 401 });
  }

  // guardAction turns a thrown model or network error into the same
  // user-facing message the Server Action used to return.
  const outcome = await guardAction('Search', async () => {
    const result = await searchCardsByMeaning(supabase, user.id, parsed.data.query, parsed.data.limit ?? 8);
    return result.ok ? { results: result.results } : { error: result.error };
  });
  if ('error' in outcome) {
    return NextResponse.json({ error: outcome.error }, { status: 503 });
  }
  return NextResponse.json({ results: outcome.results }, { headers: { 'Cache-Control': 'private, no-store' } });
}
