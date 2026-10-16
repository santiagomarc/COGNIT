import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseMock } from '@/test/supabase-mock';

const DECK_ID = '00000000-0000-4000-8000-000000000001';

const mocks = vi.hoisted(() => ({
  client: null as unknown,
  afterCallbacks: [] as Array<() => unknown>,
  fillDerivedCardData: vi.fn(async () => 'ok'),
}));

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => mocks.client }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/server', () => ({ after: (fn: () => unknown) => { mocks.afterCallbacks.push(fn); } }));
vi.mock('@/lib/card-derived', () => ({ fillDerivedCardData: mocks.fillDerivedCardData }));

describe('bulkImportCards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.afterCallbacks.length = 0;
  });

  it('fills embeddings and tags after the response, never from the browser (PERF-10)', async () => {
    mocks.client = createSupabaseMock({
      tables: {
        decks: { data: { id: DECK_ID, title: 'Deck', exam_at: null }, error: null },
        cards: { data: [{ id: 'c1' }, { id: 'c2' }], error: null },
      },
    });

    const { bulkImportCards } = await import('./card');
    const result = await bulkImportCards({ deck_id: DECK_ID, cards: [{ front: 'A', back: 'Alpha' }, { front: 'B', back: 'Beta' }] });

    expect(result).toMatchObject({ success: true, count: 2, cardIds: ['c1', 'c2'] });
    expect(mocks.fillDerivedCardData).not.toHaveBeenCalled();
    expect(mocks.afterCallbacks).toHaveLength(1);
    await mocks.afterCallbacks[0]();
    expect(mocks.fillDerivedCardData).toHaveBeenCalledWith(expect.anything(), 'user-1', DECK_ID, { trigger: 'bulk_import' });
  });
});
