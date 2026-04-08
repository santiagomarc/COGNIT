import { describe, expect, it, vi } from 'vitest';
import { loadLegacyDeckMasterySnapshots } from './legacy-mastery';

type QueryResult<T> = { data: T | null; error: { message: string; code?: string } | null };

type QuizResultRow = { id: string; deck_id: string; created_at: string };
type QuizCardResultRow = { quiz_result_id: string; card_id: string; correct: boolean };

type SupabaseMockConfig = {
  rpcResult: QueryResult<Array<{
    deck_id: string;
    assessed_cards: number;
    mastered_cards: number;
    last_quiz_at: string | null;
  }>>;
  quizResultsResult?: QueryResult<QuizResultRow[]>;
  quizCardResultsResult?: QueryResult<QuizCardResultRow[]>;
};

function createSupabaseMock(config: SupabaseMockConfig) {
  const rpc = vi.fn(async () => config.rpcResult);
  const from = vi.fn((table: string) => {
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      in: vi.fn(() => builder),
      order: vi.fn(() => builder),
      limit: vi.fn(async () => {
        if (table === 'quiz_results') {
          return config.quizResultsResult ?? { data: [], error: null };
        }

        if (table === 'quiz_card_results') {
          return config.quizCardResultsResult ?? { data: [], error: null };
        }

        return { data: [], error: null };
      }),
    };

    return builder;
  });

  return {
    rpc,
    from,
  };
}

describe('loadLegacyDeckMasterySnapshots', () => {
  it('returns RPC snapshots when the function is available', async () => {
    const supabase = createSupabaseMock({
      rpcResult: {
        data: [
          {
            deck_id: 'deck-1',
            assessed_cards: 7,
            mastered_cards: 5,
            last_quiz_at: '2026-04-08T10:00:00.000Z',
          },
        ],
        error: null,
      },
    });

    const snapshots = await loadLegacyDeckMasterySnapshots(
      supabase as never,
      'user-1',
      new Map([['deck-1', 20]])
    );

    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(snapshots.get('deck-1')).toEqual({
      assessedCards: 7,
      masteredCards: 5,
      lastQuizAt: '2026-04-08T10:00:00.000Z',
    });
  });

  it('falls back to query aggregation when RPC function is missing', async () => {
    const supabase = createSupabaseMock({
      rpcResult: {
        data: null,
        error: { message: 'function get_legacy_mastery_snapshots does not exist' },
      },
      quizResultsResult: {
        data: [
          { id: 'quiz-1', deck_id: 'deck-1', created_at: '2026-04-08T10:00:00.000Z' },
          { id: 'quiz-2', deck_id: 'deck-1', created_at: '2026-04-08T11:00:00.000Z' },
        ],
        error: null,
      },
      quizCardResultsResult: {
        data: [
          { quiz_result_id: 'quiz-1', card_id: 'card-1', correct: false },
          { quiz_result_id: 'quiz-2', card_id: 'card-1', correct: true },
          { quiz_result_id: 'quiz-2', card_id: 'card-2', correct: false },
        ],
        error: null,
      },
    });

    const snapshots = await loadLegacyDeckMasterySnapshots(
      supabase as never,
      'user-1',
      new Map([['deck-1', 10]])
    );

    expect(supabase.from).toHaveBeenCalledWith('quiz_results');
    expect(supabase.from).toHaveBeenCalledWith('quiz_card_results');

    const deckSnapshot = snapshots.get('deck-1');
    expect(deckSnapshot).toBeDefined();
    expect(deckSnapshot?.assessedCards).toBeGreaterThanOrEqual(0);
    expect(deckSnapshot?.masteredCards).toBeGreaterThanOrEqual(0);
  });

  it('returns empty map when no deck ids are provided', async () => {
    const supabase = createSupabaseMock({
      rpcResult: { data: [], error: null },
    });

    const snapshots = await loadLegacyDeckMasterySnapshots(
      supabase as never,
      'user-1',
      new Map()
    );

    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(snapshots.size).toBe(0);
  });
});
