import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { createSupabaseMock } from '@/test/supabase-mock';

const mocks = vi.hoisted(() => ({ client: null as unknown }));

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => mocks.client }));

const CARD = {
  id: 'c1',
  front: 'Mitochondria',
  back: 'Site of the Krebs cycle?',
  explanation: null,
  topic_tags: ['cell'],
  state: 'review',
  interval: 4,
  ease_factor: 2.5,
  next_review_at: '2026-10-02T00:00:00Z',
};

function request(format: string) {
  return new NextRequest(`http://localhost:3000/api/export?format=${format}`);
}

describe('GET /api/export', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('refuses a signed-out caller', async () => {
    mocks.client = createSupabaseMock({ user: null });
    const { GET } = await import('./route');
    const res = await GET(request('csv'));
    expect(res.status).toBe(401);
  });

  it('streams every deck as one CSV with a deck column, BOM first', async () => {
    mocks.client = createSupabaseMock({
      tables: {
        decks: { data: [{ id: 'd1', title: '[BIO] Cell Biology' }], error: null },
        cards: { data: [CARD], error: null },
      },
    });
    const { GET } = await import('./route');
    const res = await GET(request('csv'));

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/csv');
    expect(res.headers.get('Content-Disposition')).toMatch(/filename="cognit-decks-\d{4}-\d{2}-\d{2}\.csv"/);

    // Read bytes: Response.text() decodes with BOM-stripping, which would hide a missing one.
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const lines = new TextDecoder().decode(bytes).split('\r\n').filter(Boolean);
    expect(lines[0].startsWith('deck,question,answer')).toBe(true);
    expect(lines).toHaveLength(2);
    expect(lines[1].startsWith('Cell Biology,Site of the Krebs cycle?,Mitochondria')).toBe(true);
  });

  it('files each note under its deck in the Anki format', async () => {
    mocks.client = createSupabaseMock({
      tables: {
        decks: { data: [{ id: 'd1', title: 'Cell Biology' }], error: null },
        cards: { data: [CARD], error: null },
      },
    });
    const { GET } = await import('./route');
    const body = await (await GET(request('anki'))).text();

    expect(body).toContain('#deck column:5');
    expect(body.trimEnd().split('\n').at(-1)?.endsWith('\tCognit::Cell Biology')).toBe(true);
  });

  it('fails cleanly when the deck list cannot be read', async () => {
    mocks.client = createSupabaseMock({ tables: { decks: { data: null, error: { message: 'boom' } } } });
    const { GET } = await import('./route');
    expect((await GET(request('csv'))).status).toBe(500);
  });
});
