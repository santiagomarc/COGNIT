import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseMock } from '@/test/supabase-mock';

const DECK_ID = '00000000-0000-4000-8000-000000000001';

const mocks = vi.hoisted(() => ({
  client: null as unknown,
  afterCallbacks: [] as Array<() => unknown>,
  derivedDataRanRecently: vi.fn(),
  fillDerivedCardData: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => mocks.client }));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (fn: () => unknown) => { mocks.afterCallbacks.push(fn); },
}));
vi.mock('@/lib/card-derived', () => ({
  derivedDataRanRecently: mocks.derivedDataRanRecently,
  fillDerivedCardData: mocks.fillDerivedCardData,
}));

const post = async (body: unknown) => {
  const { POST } = await import('./route');
  return POST(new Request('http://localhost/api/decks/backfill', { method: 'POST', body: JSON.stringify(body) }) as never);
};

describe('POST /api/decks/backfill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.afterCallbacks.length = 0;
    mocks.client = createSupabaseMock({ tables: { decks: { data: { id: DECK_ID, title: 'Deck', exam_at: null }, error: null } } });
  });

  it('rejects a body without a deck id', async () => {
    expect((await post({})).status).toBe(400);
  });

  it('refuses a signed-out caller', async () => {
    mocks.client = createSupabaseMock({ user: null });
    expect((await post({ deckId: DECK_ID })).status).toBe(401);
  });

  it('schedules the fill after the response', async () => {
    mocks.derivedDataRanRecently.mockResolvedValue(false);
    mocks.fillDerivedCardData.mockResolvedValue('ok');

    const response = await post({ deckId: DECK_ID });

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ scheduled: true });
    expect(mocks.fillDerivedCardData).not.toHaveBeenCalled();
    await mocks.afterCallbacks[0]();
    expect(mocks.fillDerivedCardData).toHaveBeenCalledWith(expect.anything(), 'user-1', DECK_ID, { trigger: 'deck_visit' });
  });

  it('runs at most once a minute', async () => {
    mocks.derivedDataRanRecently.mockResolvedValue(true);

    const response = await post({ deckId: DECK_ID });

    expect(await response.json()).toEqual({ scheduled: false });
    expect(mocks.afterCallbacks).toHaveLength(0);
  });
});
