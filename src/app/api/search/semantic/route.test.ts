import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createSupabaseMock } from '@/test/supabase-mock';

const mocks = vi.hoisted(() => ({ client: null as unknown, searchCardsByMeaning: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => mocks.client }));
vi.mock('@/lib/card-search', () => ({ searchCardsByMeaning: mocks.searchCardsByMeaning }));

const get = async (path: string) => {
  const { GET } = await import('./route');
  return GET(new NextRequest(`http://localhost${path}`));
};

describe('GET /api/search/semantic', () => {
  it('needs at least three characters', async () => {
    mocks.client = createSupabaseMock();
    expect((await get('/api/search/semantic?q=ab')).status).toBe(400);
  });

  it('refuses a signed-out caller', async () => {
    mocks.client = createSupabaseMock({ user: null });
    expect((await get('/api/search/semantic?q=cells')).status).toBe(401);
  });

  it('returns results, and a refused reservation as 503 with its message', async () => {
    mocks.client = createSupabaseMock();
    mocks.searchCardsByMeaning.mockResolvedValueOnce({ ok: true, results: [{ id: 'c1' }] });
    const ok = await get('/api/search/semantic?q=cells');
    expect(await ok.json()).toEqual({ results: [{ id: 'c1' }] });

    mocks.searchCardsByMeaning.mockResolvedValueOnce({ ok: false, error: 'AI limit reached for semantic search.' });
    const limited = await get('/api/search/semantic?q=cells');
    expect(limited.status).toBe(503);
    expect(await limited.json()).toEqual({ error: 'AI limit reached for semantic search.' });
  });
});
