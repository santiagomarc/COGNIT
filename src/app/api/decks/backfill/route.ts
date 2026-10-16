import { after, NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireOwnedDeck } from '@/app/actions/_shared';
import { runBackground } from '@/lib/background';
import { derivedDataRanRecently, fillDerivedCardData } from '@/lib/card-derived';
import { ensureSessionHeadroom } from '@/lib/supabase/session';

/**
 * Deck-visit backfill (performance plan §5.2, AI-13). The deck page calls this
 * while the deck has cards without an embedding or tags; the work runs after
 * the response, so nothing waits on it.
 *
 * A route rather than a Server Action, for two reasons. A tab's Server Actions
 * run one at a time (PERF-10), and a background fill must never hold the
 * user's next save behind it. And a route can write a refreshed session
 * cookie, which a page render cannot: `ensureSessionHeadroom()` refreshes a
 * nearly expired token before the background calls need it (LC-02).
 */
export const maxDuration = 60;

const bodySchema = z.object({ deckId: z.uuid() });

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid deck id.' }, { status: 400 });
  }

  const deckAccess = await requireOwnedDeck(parsed.data.deckId);
  if ('error' in deckAccess) {
    const status = deckAccess.error === 'You must be logged in.' ? 401 : 404;
    return NextResponse.json({ error: deckAccess.error }, { status });
  }

  const { supabase, user } = deckAccess;
  // One run per quota window: the page asks on every visit and every change
  // to its pending count, and the next ask after the window takes the rest.
  if (await derivedDataRanRecently(supabase)) {
    return NextResponse.json({ scheduled: false }, { status: 202 });
  }

  await ensureSessionHeadroom();
  const deckId = parsed.data.deckId;
  after(() => runBackground(
    'deck_backfill',
    () => fillDerivedCardData(supabase, user.id, deckId, { trigger: 'deck_visit' }),
    { deckId },
  ));

  return NextResponse.json({ scheduled: true }, { status: 202 });
}
