import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseMock } from '@/test/supabase-mock';

const mocks = vi.hoisted(() => ({ embedTexts: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => createSupabaseMock() }));
vi.mock('@/lib/embeddings', () => ({ embedTexts: mocks.embedTexts, toVectorLiteral: (v: number[]) => `[${v.join(',')}]` }));

const { searchCardsByMeaning, searchCardsByText } = await import('./card-search');
const { clearQueryEmbeddingCache } = await import('./query-embedding-cache');

const ROW = { id: 'c1', deck_id: 'd1', deck_title: 'Bio', front: 'Mitosis', back: 'Cell division.' };

describe('searchCardsByText', () => {
  it('asks the lexical RPC and marks results as text matches', async () => {
    const client = createSupabaseMock({ rpcs: { search_user_cards_lexical: { data: [ROW], error: null } } });
    const outcome = await searchCardsByText(client as never, 'mito');
    expect(outcome).toEqual({ ok: true, results: [{ ...ROW, similarity: null }] });
    expect(client.rpc).toHaveBeenCalledWith('search_user_cards_lexical', { p_query: 'mito', p_limit: 8 });
    expect(client.rpc).not.toHaveBeenCalledWith('reserve_ai_call', expect.anything());
  });
});

describe('searchCardsByMeaning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearQueryEmbeddingCache();
  });

  const client = () => createSupabaseMock({
    rpcs: {
      reserve_ai_call: { data: 'r1', error: null },
      search_user_cards_by_embedding: { data: [{ ...ROW, similarity: 0.8 }], error: null },
    },
  });

  it('embeds a new query under a reservation and records the outcome', async () => {
    const supabase = client();
    mocks.embedTexts.mockResolvedValue([[0.1, 0.2]]);

    const outcome = await searchCardsByMeaning(supabase as never, 'user-1', 'cell division');

    expect(outcome).toEqual({ ok: true, results: [{ ...ROW, similarity: 0.8 }] });
    expect(supabase.rpc).toHaveBeenCalledWith('reserve_ai_call', expect.objectContaining({ p_action: 'semantic_search' }));
    expect(supabase.__inserted.ai_call_outcomes).toHaveLength(1);
  });

  it('reuses a cached query embedding: no model call, no reservation', async () => {
    mocks.embedTexts.mockResolvedValue([[0.1, 0.2]]);
    await searchCardsByMeaning(client() as never, 'user-1', 'cell division');

    const second = client();
    const outcome = await searchCardsByMeaning(second as never, 'user-1', 'Cell  Division');

    expect(outcome.ok).toBe(true);
    expect(mocks.embedTexts).toHaveBeenCalledTimes(1);
    expect(second.rpc).not.toHaveBeenCalledWith('reserve_ai_call', expect.anything());
    expect(second.rpc).toHaveBeenCalledWith('search_user_cards_by_embedding', expect.objectContaining({ p_query_embedding: '[0.1,0.2]' }));
  });
});
