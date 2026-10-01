import { NextResponse, type NextRequest } from 'next/server';

import {
  CSV_HEADER_ALL,
  EXPORT_COLUMNS,
  ankiHeaderAll,
  exportAllFilename,
  toAnkiRowWithDeck,
  toCsvRowWithDeck,
  type ExportCard,
  type ExportFormat,
} from '@/lib/deck-export';
import { removeDeckTagFromTitle } from '@/lib/deck-tags';
import { logger } from '@/lib/logger';
import { getRequestClient, getSessionUser } from '@/lib/supabase/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** PostgREST's default max-rows; each deck is paged through in these. */
const PAGE = 1000;

/**
 * GET /api/export?format=csv|anki — every deck the user owns in one file
 * (sidebar plan §4.5, DST-04). The per-deck route's twin: same streaming, same
 * session check (`/api` is outside the proxy matcher), same headers. Rows
 * carry their deck — a leading `deck` column in the CSV, Anki's
 * `#deck column:5` — so one import rebuilds the library, and the GUIDs match
 * the single-deck export, so importing both never duplicates a note.
 *
 * RLS scopes every read to the caller, and the trash policy hides trashed
 * decks, exactly as the deck index does.
 */
export async function GET(request: NextRequest) {
  const format: ExportFormat = request.nextUrl.searchParams.get('format') === 'anki' ? 'anki' : 'csv';

  const [supabase, user] = await Promise.all([getRequestClient(), getSessionUser()]);
  if (!user) {
    return NextResponse.json({ error: 'You must be logged in.' }, { status: 401 });
  }

  const { data: decks, error: decksError } = await supabase
    .from('decks')
    .select('id, title')
    .eq('user_id', user.id)
    .order('title', { ascending: true });

  if (decksError) {
    logger.error('export-all', 'deck list read failed', { code: decksError.code, message: decksError.message });
    return NextResponse.json({ error: 'Export failed.' }, { status: 500 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // The BOM makes Excel open a UTF-8 CSV as UTF-8.
      controller.enqueue(encoder.encode(format === 'anki' ? ankiHeaderAll() : `\uFEFF${CSV_HEADER_ALL}\r\n`));

      for (const deck of decks ?? []) {
        const title = removeDeckTagFromTitle(deck.title);

        for (let from = 0; ; from += PAGE) {
          const { data, error } = await supabase
            .from('cards')
            .select(EXPORT_COLUMNS)
            .eq('deck_id', deck.id)
            .order('created_at', { ascending: true })
            .order('id', { ascending: true })
            .range(from, from + PAGE - 1);

          if (error) {
            logger.error('export-all', 'card page read failed', { code: error.code, message: error.message });
            controller.error(new Error('Export failed.'));
            return;
          }

          const rows = (data ?? []) as ExportCard[];
          const toRow = format === 'anki' ? toAnkiRowWithDeck : toCsvRowWithDeck;
          controller.enqueue(encoder.encode(rows.map((card) => toRow(title, card)).join('')));
          if (rows.length < PAGE) break;
        }
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': format === 'anki' ? 'text/plain; charset=utf-8' : 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${exportAllFilename(format, new Date())}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
