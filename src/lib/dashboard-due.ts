import { logger } from './logger';

export type DueCardsByDeckRow = {
  deck_id: string;
  due_count: number;
};

type RpcDueRow = {
  deck_id: string;
  due_count: number | string | null;
};

type RpcErrorLike = {
  message: string;
  code?: string;
};

type AwaitableResult<T> = PromiseLike<T> | Promise<T>;

type DueBreakdownSupabaseClient = {
  rpc: (
    fn: 'get_due_cards_by_deck',
    args: { p_user_id: string; p_now: string }
  ) => AwaitableResult<{ data: RpcDueRow[] | null; error: RpcErrorLike | null }>;
};

export async function loadDueByDeckRows(
  supabase: DueBreakdownSupabaseClient,
  userId: string,
  nowIso: string,
  logError: (message: string, ...args: unknown[]) => void = (message, ...args) => {
    logger.error('dashboard', message.replace(/^\[dashboard\]\s*/, ''), args.length ? { args } : undefined);
  },
): Promise<DueCardsByDeckRow[]> {
  const { data: dueBreakdownRows, error: dueBreakdownError } = await supabase.rpc('get_due_cards_by_deck', {
    p_user_id: userId,
    p_now: nowIso,
  });

  if (dueBreakdownError) {
    logError('[dashboard] failed to read due cards breakdown:', dueBreakdownError.code, dueBreakdownError.message);
    return [];
  }

  return (dueBreakdownRows ?? []).map((row) => ({
    deck_id: row.deck_id,
    due_count: Number(row.due_count ?? 0),
  }));
}
