import { describe, expect, it, vi } from 'vitest';
import { loadDueByDeckRows } from './dashboard-due';

type DueRpcResult = {
  data: Array<{ deck_id: string; due_count: number | string | null }> | null;
  error: { message: string; code?: string } | null;
};

type DueFallbackResult = {
  data: Array<{ deck_id: string }> | null;
  error: { message: string } | null;
};

function createSupabaseMock(config: { rpcResult: DueRpcResult; fallbackResult?: DueFallbackResult }) {
  const lte = vi.fn(async () => config.fallbackResult ?? { data: [], error: null });
  const select = vi.fn(() => ({ lte }));
  const from = vi.fn(() => ({ select }));
  const rpc = vi.fn(async () => config.rpcResult);

  return {
    rpc,
    from,
    lte,
  };
}

describe('loadDueByDeckRows', () => {
  it('uses RPC rows when function is available', async () => {
    const supabase = createSupabaseMock({
      rpcResult: {
        data: [
          { deck_id: 'deck-1', due_count: 3 },
          { deck_id: 'deck-2', due_count: '1' },
        ],
        error: null,
      },
    });

    const rows = await loadDueByDeckRows(supabase as never, 'user-1', '2026-04-08T00:00:00.000Z', vi.fn());

    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(supabase.from).not.toHaveBeenCalled();
    expect(rows).toEqual([
      { deck_id: 'deck-1', due_count: 3 },
      { deck_id: 'deck-2', due_count: 1 },
    ]);
  });

  it('falls back to card query when RPC function is missing', async () => {
    const supabase = createSupabaseMock({
      rpcResult: {
        data: null,
        error: { message: 'function get_due_cards_by_deck(uuid, timestamptz) does not exist' },
      },
      fallbackResult: {
        data: [
          { deck_id: 'deck-1' },
          { deck_id: 'deck-1' },
          { deck_id: 'deck-2' },
        ],
        error: null,
      },
    });

    const rows = await loadDueByDeckRows(supabase as never, 'user-1', '2026-04-08T00:00:00.000Z', vi.fn());

    expect(supabase.from).toHaveBeenCalledWith('cards');
    expect(rows).toEqual([
      { deck_id: 'deck-1', due_count: 2 },
      { deck_id: 'deck-2', due_count: 1 },
    ]);
  });

  it('returns empty when RPC fails for reasons other than missing function', async () => {
    const supabase = createSupabaseMock({
      rpcResult: {
        data: null,
        error: { message: 'permission denied for function', code: '42501' },
      },
    });

    const logError = vi.fn();
    const rows = await loadDueByDeckRows(supabase as never, 'user-1', '2026-04-08T00:00:00.000Z', logError);

    expect(rows).toEqual([]);
    expect(supabase.from).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalled();
  });

  it('returns empty when fallback query fails', async () => {
    const supabase = createSupabaseMock({
      rpcResult: {
        data: null,
        error: { message: 'function get_due_cards_by_deck(uuid, timestamptz) does not exist' },
      },
      fallbackResult: {
        data: null,
        error: { message: 'network issue' },
      },
    });

    const rows = await loadDueByDeckRows(supabase as never, 'user-1', '2026-04-08T00:00:00.000Z', vi.fn());
    expect(rows).toEqual([]);
  });
});
