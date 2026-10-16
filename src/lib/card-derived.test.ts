import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseMock } from '@/test/supabase-mock';

const mocks = vi.hoisted(() => ({ embedPendingCards: vi.fn(), enrichPendingCards: vi.fn() }));

vi.mock('@/lib/card-embeddings', () => ({ EMBED_BATCH_SIZE: 100, embedPendingCards: mocks.embedPendingCards }));
vi.mock('@/lib/card-enrichment', () => ({ enrichPendingCards: mocks.enrichPendingCards }));

const { derivedDataRanRecently, fillDerivedCardData } = await import('./card-derived');

describe('fillDerivedCardData', () => {
  beforeEach(() => vi.clearAllMocks());

  it('embeds one batch, then enriches, and reports ok when either did work', async () => {
    mocks.embedPendingCards.mockResolvedValue({ ok: true, synced: 5, pending: 0, total: 5 });
    mocks.enrichPendingCards.mockResolvedValue({ ok: true, enriched: 0, remaining: 0 });

    const outcome = await fillDerivedCardData({} as never, 'user-1', 'deck-1', { trigger: 'test', enrichMinimum: 10 });

    expect(outcome).toBe('ok');
    expect(mocks.embedPendingCards).toHaveBeenCalledWith({}, 'user-1', 'deck-1', { limit: 100, trigger: 'test' });
    expect(mocks.enrichPendingCards).toHaveBeenCalledWith({}, 'user-1', 'deck-1', { minimum: 10, trigger: 'test' });
  });

  it('reports skipped when there was nothing to do', async () => {
    mocks.embedPendingCards.mockResolvedValue({ ok: true, synced: 0, pending: 0, total: 5 });
    mocks.enrichPendingCards.mockResolvedValue({ ok: true, enriched: 0, remaining: 0 });
    expect(await fillDerivedCardData({} as never, 'u', 'd', { trigger: 'test' })).toBe('skipped');
  });

  it('still enriches when embedding throws, and reports failed', async () => {
    mocks.embedPendingCards.mockRejectedValue(new Error('504'));
    mocks.enrichPendingCards.mockResolvedValue({ ok: true, enriched: 3, remaining: 0 });

    expect(await fillDerivedCardData({} as never, 'u', 'd', { trigger: 'test' })).toBe('failed');
    expect(mocks.enrichPendingCards).toHaveBeenCalled();
  });
});

describe('derivedDataRanRecently', () => {
  it('is true only when a fill reserved within the window', async () => {
    const recent = createSupabaseMock({ tables: { ai_usage_logs: { data: [{ id: 'r' }], error: null } } });
    const quiet = createSupabaseMock({ tables: { ai_usage_logs: { data: [], error: null } } });
    expect(await derivedDataRanRecently(recent as never)).toBe(true);
    expect(await derivedDataRanRecently(quiet as never)).toBe(false);
  });
});
