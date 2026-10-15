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
