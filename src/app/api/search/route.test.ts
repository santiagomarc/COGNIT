import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createSupabaseMock } from '@/test/supabase-mock';

const mocks = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => mocks.client }));

const get = async (path: string) => {
  const { GET } = await import('./route');
  return GET(new NextRequest(`http://localhost${path}`));
};

describe('GET /api/search', () => {
  it('needs at least two characters', async () => {
    mocks.client = createSupabaseMock();
    expect((await get('/api/search?q=a')).status).toBe(400);
  });

  it('refuses a signed-out caller', async () => {
    mocks.client = createSupabaseMock({ user: null });
    expect((await get('/api/search?q=mito')).status).toBe(401);
  });

  it('returns text matches, uncached', async () => {
    mocks.client = createSupabaseMock({
      rpcs: { search_user_cards_lexical: { data: [{ id: 'c1', deck_id: 'd1', deck_title: 'Bio', front: 'Mitosis', back: 'B' }], error: null } },
    });
    const response = await get('/api/search?q=mito');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ results: [{ id: 'c1', deck_id: 'd1', deck_title: 'Bio', front: 'Mitosis', back: 'B', similarity: null }] });
  });
});
