import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseMock } from '@/test/supabase-mock';

const DECK_ID = '00000000-0000-4000-8000-000000000001';
const CARD_ID = '00000000-0000-4000-8000-000000000002';

const mocks = vi.hoisted(() => ({ client: null as unknown, revalidatePath: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => mocks.client }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));

describe('gradeCard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('saves the grade without revalidating, so the response carries no page re-render (PERF-11)', async () => {
    const client = createSupabaseMock({
      tables: { cards: { data: { id: CARD_ID, state: 'review', interval: 6, ease_factor: 2.5, repetition_count: 2 }, error: null } },
      rpcs: { grade_owned_card: { data: null, error: null } },
    });
    mocks.client = client;

    const { gradeCard } = await import('./study');
    const result = await gradeCard({ card_id: CARD_ID, deck_id: DECK_ID, grade: 'good', duration_ms: 1200 });

    expect(result).toMatchObject({ success: true });
    expect(client.rpc).toHaveBeenCalledWith('grade_owned_card', expect.objectContaining({ p_card_id: CARD_ID }));
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe('finishStudySession', () => {
  beforeEach(() => vi.clearAllMocks());

  it('revalidates the deck and the dashboard once, when the session ends', async () => {
    mocks.client = createSupabaseMock({ tables: { decks: { data: { id: DECK_ID, title: 'Deck' }, error: null } } });

    const { finishStudySession } = await import('./study');
    await finishStudySession(DECK_ID);

    expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard');
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/dashboard/${DECK_ID}`);
  });
});

describe('getStudyContinuation', () => {
  const OTHER_DECK = '00000000-0000-4000-8000-000000000003';
  const THIRD_DECK = '00000000-0000-4000-8000-000000000004';

  beforeEach(() => vi.clearAllMocks());

  function mockClient(rows: Array<{ deck_id: string; due_count: number; new_count: number }>, deck: unknown = { id: OTHER_DECK, title: 'Pharmacology' }) {
    mocks.client = createSupabaseMock({
      tables: { decks: { data: deck, error: null } },
      rpcs: { get_due_cards_by_deck: { data: rows, error: null } },
    });
  }

  it('reports what is left in this deck', async () => {
    mockClient([
      { deck_id: DECK_ID, due_count: 21, new_count: 0 },
      { deck_id: OTHER_DECK, due_count: 12, new_count: 0 },
    ]);
    const { getStudyContinuation } = await import('./study');
    expect(await getStudyContinuation(DECK_ID)).toMatchObject({
      success: true,
      hereDue: 21,
      next: { deckId: OTHER_DECK, title: 'Pharmacology', dueCount: 12 },
    });
  });

  it('points at the deck with the most due when this one is done', async () => {
    mockClient([
      { deck_id: DECK_ID, due_count: 0, new_count: 3 },
      { deck_id: THIRD_DECK, due_count: 2, new_count: 0 },
      { deck_id: OTHER_DECK, due_count: 12, new_count: 0 },
    ]);
    const { getStudyContinuation } = await import('./study');
    const result = await getStudyContinuation(DECK_ID);
    expect(result).toMatchObject({ hereDue: 0, next: { deckId: OTHER_DECK, dueCount: 12 } });
  });

  it('has nothing next when nothing is due anywhere', async () => {
    mockClient([{ deck_id: DECK_ID, due_count: 0, new_count: 0 }]);
    const { getStudyContinuation } = await import('./study');
    expect(await getStudyContinuation(DECK_ID)).toMatchObject({ success: true, hereDue: 0, next: null });
  });

  it('does not name a deck the caller cannot read', async () => {
    mockClient([{ deck_id: OTHER_DECK, due_count: 4, new_count: 0 }], null);
    const { getStudyContinuation } = await import('./study');
    expect(await getStudyContinuation(DECK_ID)).toMatchObject({ next: null });
  });

  it('rejects a malformed id and a signed-out caller', async () => {
    mockClient([]);
    const { getStudyContinuation } = await import('./study');
    expect(await getStudyContinuation('nope')).toEqual({ error: 'Invalid deck id.' });

    mocks.client = createSupabaseMock({ user: null });
    expect(await getStudyContinuation(DECK_ID)).toEqual({ error: 'You must be logged in.' });
  });
});
