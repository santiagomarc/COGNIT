import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseMock } from '@/test/supabase-mock';

const DECK_ID = '00000000-0000-4000-8000-000000000001';

const mocks = vi.hoisted(() => ({ client: null as unknown }));

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => mocks.client }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

describe('syncEmbeddings', () => {
  beforeEach(() => vi.clearAllMocks());

  it('spends no AI reservation when nothing is pending (AI-14)', async () => {
    const client = createSupabaseMock({
      tables: {
        decks: { data: { id: DECK_ID, title: 'Deck' }, error: null },
        cards: { data: null, error: null, count: 0 },
      },
      rpcs: { reserve_ai_call: { data: 'reservation-1', error: null } },
    });
    mocks.client = client;

    const { syncEmbeddings } = await import('./chat');
    const result = await syncEmbeddings({ deck_id: DECK_ID });

    expect(result).toMatchObject({ success: true, synced: 0, pending: 0 });
    expect(client.rpc).not.toHaveBeenCalledWith('reserve_ai_call', expect.anything());
  });
});
