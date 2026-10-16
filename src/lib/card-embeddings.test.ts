import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseMock } from '@/test/supabase-mock';

const DECK_ID = '00000000-0000-4000-8000-000000000001';

const mocks = vi.hoisted(() => ({ embedTexts: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => createSupabaseMock() }));
vi.mock('@/lib/embeddings', () => ({
  embedTexts: mocks.embedTexts,
  toVectorLiteral: (values: number[]) => `[${values.join(',')}]`,
}));

const { embedPendingCards } = await import('./card-embeddings');

describe('embedPendingCards', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reserves nothing when every card already has an embedding (AI-14)', async () => {
    const client = createSupabaseMock({ tables: { cards: { data: null, error: null, count: 0 } } });
    const result = await embedPendingCards(client as never, 'user-1', DECK_ID, { limit: 100, trigger: 'test' });

    expect(result).toEqual({ ok: true, synced: 0, pending: 0, total: 0 });
    expect(client.rpc).not.toHaveBeenCalled();
    expect(mocks.embedTexts).not.toHaveBeenCalled();
  });

  it('embeds the pending cards under one reservation and records the outcome', async () => {
    const client = createSupabaseMock({
      tables: { cards: { data: [{ id: 'c1', front: 'Osmosis', back: 'Water crossing a membrane.' }], error: null, count: 2 } },
      rpcs: {
        reserve_ai_call: { data: 'r1', error: null },
        apply_card_embeddings_batch: { data: 1, error: null },
      },
    });
    mocks.embedTexts.mockResolvedValue([[0.1, 0.2]]);

    const result = await embedPendingCards(client as never, 'user-1', DECK_ID, { limit: 100, trigger: 'test' });

    expect(result).toEqual({ ok: true, synced: 1, pending: 1, total: 2 });
    expect(client.rpc).toHaveBeenCalledWith('reserve_ai_call', expect.objectContaining({ p_action: 'sync_embeddings' }));
    expect(mocks.embedTexts).toHaveBeenCalledWith(['Osmosis\nWater crossing a membrane.'], expect.objectContaining({ taskType: 'RETRIEVAL_DOCUMENT' }));
    expect(client.rpc).toHaveBeenCalledWith('apply_card_embeddings_batch', { p_deck_id: DECK_ID, p_updates: [{ card_id: 'c1', embedding: '[0.1,0.2]' }] });
    expect(client.__inserted.ai_call_outcomes).toHaveLength(1);
  });

  it('reports a refused reservation without embedding', async () => {
    const client = createSupabaseMock({
      tables: { cards: { data: [], error: null, count: 3 } },
      rpcs: { reserve_ai_call: { data: null, error: { message: 'AI_RATE_LIMIT', code: 'P0001' } } },
    });

    const result = await embedPendingCards(client as never, 'user-1', DECK_ID, { limit: 100, trigger: 'test' });

    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('AI limit reached') });
    expect(mocks.embedTexts).not.toHaveBeenCalled();
  });
});
