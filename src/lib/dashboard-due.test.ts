import { describe, expect, it, vi } from 'vitest';
import { loadDueByDeckRows } from './dashboard-due';

type DueRpcResult = {
  data: Array<{ deck_id: string; due_count: number | string | null }> | null;
  error: { message: string; code?: string } | null;
};

function createSupabaseMock(config: { rpcResult: DueRpcResult }) {
  // `from` is still asserted on: it must never be called now that the
  // per-card fallback query is gone.
  const from = vi.fn();
  const rpc = vi.fn(async () => config.rpcResult);

  return { rpc, from };
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

  it('returns empty and logs when the RPC fails', async () => {
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
});
