import { NextResponse, type NextRequest } from 'next/server';
import {
  CSV_HEADER,
  EXPORT_COLUMNS,
  ankiHeader,
  exportFilename,
  toAnkiRow,
  toCsvRow,
  type ExportCard,
  type ExportFormat,
} from '@/lib/deck-export';
import { logger } from '@/lib/logger';
import { getRequestClient, getSessionUser } from '@/lib/supabase/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** PostgREST's default max-rows; the export pages through the deck in these. */
const PAGE = 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * GET /api/decks/[deckId]/export?format=csv|anki — the owner's deck as a
 * download, streamed a page at a time so a 5,000-card deck never sits in
 * memory. RLS scopes every read; the ownership check is only for a 404.
 * `/api` is outside the proxy matcher, so this route verifies the session
 * itself (the server client can still refresh it — route handlers may set cookies).
 */
export async function GET(request: NextRequest, context: { params: Promise<{ deckId: string }> }) {
  const { deckId } = await context.params;
  if (!UUID.test(deckId)) {
    return NextResponse.json({ error: 'Invalid deck id.' }, { status: 400 });
  }
  const format: ExportFormat = request.nextUrl.searchParams.get('format') === 'anki' ? 'anki' : 'csv';

  const [supabase, user] = await Promise.all([getRequestClient(), getSessionUser()]);
  if (!user) {
    return NextResponse.json({ error: 'You must be logged in.' }, { status: 401 });
  }

  const { data: deck } = await supabase
    .from('decks')
    .select('id, title')
    .eq('id', deckId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!deck) {
    return NextResponse.json({ error: 'Deck not found.' }, { status: 404 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // The BOM makes Excel open a UTF-8 CSV as UTF-8.
      controller.enqueue(encoder.encode(format === 'anki' ? ankiHeader(deck.title) : `\uFEFF${CSV_HEADER}\r\n`));
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from('cards')
          .select(EXPORT_COLUMNS)
          .eq('deck_id', deckId)
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) {
          logger.error('export', 'card page read failed', { code: error.code, message: error.message });
          controller.error(new Error('Export failed.'));
          return;
        }
        const rows = (data ?? []) as ExportCard[];
        controller.enqueue(encoder.encode(rows.map(format === 'anki' ? toAnkiRow : toCsvRow).join('')));
        if (rows.length < PAGE) break;
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': format === 'anki' ? 'text/plain; charset=utf-8' : 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${exportFilename(deck.title, format)}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
