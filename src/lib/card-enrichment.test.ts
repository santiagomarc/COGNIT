import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseMock } from '@/test/supabase-mock';

const DECK_ID = '00000000-0000-4000-8000-000000000001';

const mocks = vi.hoisted(() => ({ generateJson: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => createSupabaseMock() }));
vi.mock('@/lib/env-server', () => ({
  getServerEnv: () => ({ GEMINI_API_KEY: 'test', GEMINI_MODEL: 'gemini-test', GEMINI_EMBEDDING_MODEL: 'embed-test', GEMINI_MODEL_MAX_TOKENS: 4096 }),
}));
vi.mock('@/lib/gemini', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/gemini')>()),
  generateJson: mocks.generateJson,
}));

const { enrichPendingCards, parseEnrichmentRows } = await import('./card-enrichment');

describe('parseEnrichmentRows', () => {
  const fronts = new Map([['c1', 'Mitosis'], ['c2', 'Osmosis']]);

  it('keeps cards from the batch, normalises tags and keeps only a usable set of three distractors', () => {
    const raw = JSON.stringify({ cards: [
      { id: 'c1', mcq_distractors: ['Meiosis', 'Apoptosis', 'Cytokinesis'], topic_tags: ['Cell Division', ' cell division ', 'x'] },
      { id: 'c2', mcq_distractors: ['osmosis', 'Diffusion', 'Active transport'], topic_tags: ['transport'] },
      { id: 'other', mcq_distractors: ['a', 'b', 'c'], topic_tags: ['ignored'] },
    ] });
    expect(parseEnrichmentRows(raw, fronts)).toEqual([
      { id: 'c1', topic_tags: ['cell division'], mcq_distractors: ['Meiosis', 'Apoptosis', 'Cytokinesis'] },
      // The answer among the options: the set is dropped, the tags are kept.
      { id: 'c2', topic_tags: ['transport'], mcq_distractors: [] },
    ]);
  });

  it('throws on a payload without a cards array', () => {
    expect(() => parseEnrichmentRows('{}', fronts)).toThrow('unexpected enrichment format');
  });
});

describe('enrichPendingCards', () => {
  beforeEach(() => vi.clearAllMocks());

  it('skips, without reserving, until enough cards need work', async () => {
    const client = createSupabaseMock({ tables: { cards: { data: null, error: null, count: 3 } } });
    const result = await enrichPendingCards(client as never, 'user-1', DECK_ID, { minimum: 10, trigger: 'test' });

    expect(result).toEqual({ ok: true, enriched: 0, remaining: 3 });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('enriches a batch with one call, reusing the deck\'s tags, and writes only tags and distractors', async () => {
    const client = createSupabaseMock({
      tables: {
        cards: { data: [{ id: 'c1', front: 'Mitosis', back: 'Cell division.' }], error: null, count: 1 },
        decks: { data: { title: 'Biology' }, error: null },
      },
      rpcs: {
        reserve_ai_call: { data: 'r1', error: null },
        get_deck_topic_tag_counts: { data: [{ topic_tag: 'cell biology', tag_count: 4 }], error: null },
        apply_card_background_enrichment_batch: { data: 1, error: null },
      },
    });
    mocks.generateJson.mockResolvedValue({
      text: JSON.stringify({ cards: [{ id: 'c1', mcq_distractors: ['Meiosis', 'Apoptosis', 'Cytokinesis'], topic_tags: ['cell biology'] }] }),
      usageMetadata: { promptTokenCount: 300, candidatesTokenCount: 40 },
    });

    const result = await enrichPendingCards(client as never, 'user-1', DECK_ID, { trigger: 'test' });

    expect(result).toEqual({ ok: true, enriched: 1, remaining: 0 });
    expect(mocks.generateJson).toHaveBeenCalledTimes(1);
    expect(mocks.generateJson.mock.calls[0][0].systemInstruction).toContain('cell biology');
    expect(client.rpc).toHaveBeenCalledWith('reserve_ai_call', expect.objectContaining({ p_action: 'enrich_cards', p_calls: 1 }));
    expect(client.rpc).toHaveBeenCalledWith('apply_card_background_enrichment_batch', {
      p_deck_id: DECK_ID,
      p_rows: [{ id: 'c1', topic_tags: ['cell biology'], mcq_distractors: ['Meiosis', 'Apoptosis', 'Cytokinesis'] }],
    });
    expect(client.__inserted.ai_call_outcomes?.[0]).toMatchObject({ action: 'enrich_cards', input_tokens: 300, output_tokens: 40 });
  });
});
