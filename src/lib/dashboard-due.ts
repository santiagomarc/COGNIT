import { isMissingDatabaseFunctionError } from './supabase-errors';

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

type DueCardsFallbackRow = {
  deck_id: string;
};

type AwaitableResult<T> = PromiseLike<T> | Promise<T>;

type DueBreakdownSupabaseClient = {
  rpc: (
    fn: 'get_due_cards_by_deck',
    args: { p_user_id: string; p_now: string }
  ) => AwaitableResult<{ data: RpcDueRow[] | null; error: RpcErrorLike | null }>;
  from: (table: 'cards') => {
    select: (columns: 'deck_id') => {
      lte: (
        column: 'next_review_at',
        value: string
      ) => AwaitableResult<{ data: DueCardsFallbackRow[] | null; error: { message: string } | null }>;
    };
  };
};

export async function loadDueByDeckRows(
  supabase: DueBreakdownSupabaseClient,
  userId: string,
  nowIso: string,
  logError: (message: string, ...args: unknown[]) => void = console.error,
): Promise<DueCardsByDeckRow[]> {
  const { data: dueBreakdownRows, error: dueBreakdownError } = await supabase.rpc('get_due_cards_by_deck', {
    p_user_id: userId,
    p_now: nowIso,
  });

  if (dueBreakdownError && !isMissingDatabaseFunctionError(dueBreakdownError.message, 'get_due_cards_by_deck')) {
    logError('[dashboard] failed to read due cards breakdown:', dueBreakdownError.code, dueBreakdownError.message);
    return [];
  }

  if (!dueBreakdownError) {
    return (dueBreakdownRows ?? []).map((row) => ({
      deck_id: row.deck_id,
      due_count: Number(row.due_count ?? 0),
    }));
  }

  const { data: dueCards, error: dueCardsError } = await supabase
    .from('cards')
    .select('deck_id')
    .lte('next_review_at', nowIso);

  if (dueCardsError) {
    logError('[dashboard] fallback due cards query failed:', dueCardsError.message);
    return [];
  }

  const dueByDeck = new Map<string, number>();
  for (const row of dueCards ?? []) {
    dueByDeck.set(row.deck_id, (dueByDeck.get(row.deck_id) ?? 0) + 1);
  }

  return Array.from(dueByDeck.entries()).map(([deck_id, due_count]) => ({ deck_id, due_count }));
}
