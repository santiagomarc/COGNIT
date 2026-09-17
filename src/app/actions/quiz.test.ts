import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseMock, type QueryResult } from '@/test/supabase-mock';

const DECK_ID = '00000000-0000-4000-8000-000000000001';
const CARD_A = '00000000-0000-4000-8000-00000000000a';
const CARD_B = '00000000-0000-4000-8000-00000000000b';

const mocks = vi.hoisted(() => ({ client: null as unknown }));

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => mocks.client }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

type CardRow = {
  id: string;
  front: string;
  back: string;
  id_question: string | null;
  mcq_distractors: string[] | null;
  state: string;
  interval: number;
  ease_factor: number;
  repetition_count: number;
};

function card(id: string, front: string): CardRow {
  return {
    id,
    front,
    back: `definition of ${front}`,
    id_question: `what is ${front}?`,
    mcq_distractors: ['x', 'y', 'z'],
    state: 'new',
    interval: 0,
    ease_factor: 2.5,
    repetition_count: 0,
  };
}

function buildClient(cards: CardRow[], overrides: Record<string, QueryResult> = {}) {
  return createSupabaseMock({
    tables: {
      decks: { data: { id: DECK_ID, title: 'Deck' }, error: null },
      cards: { data: cards, error: null },
      quiz_results: { data: { id: 'quiz-1', created_at: '2026-09-07T00:00:00Z' }, error: null },
      quiz_card_results: { data: null, error: null },
      card_mastery_state: { data: [], error: null },
      ...overrides,
    },
    rpcs: {
      log_quiz_result: {
        data: [{ quiz_result_id: 'quiz-1', created_at: '2026-09-07T00:00:00Z', updated_cards: cards.length }],
        error: null,
      },
    },
  });
}

async function logQuiz(input: Parameters<typeof import('./quiz').logQuizResult>[0]) {
  const { logQuizResult } = await import('./quiz');
  return logQuizResult(input);
}

describe('logQuizResult — anti-cheat contract', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects results referencing cards outside the deck', async () => {
    // Client claims two cards; the deck only owns one.
    mocks.client = buildClient([card(CARD_A, 'Mitosis')]);

    const result = await logQuiz({
      deck_id: DECK_ID,
      mode: 'mcq',
      duration_ms: 1000,
      include_in_history: true,
      results: [
        { card_id: CARD_A, user_answer: 'Mitosis' },
        { card_id: CARD_B, user_answer: 'Meiosis' },
      ],
    });

    expect(result).toMatchObject({ error: expect.stringContaining('outside this deck') });
  });

  it('scores a correct MCQ answer from the database copy of the term', async () => {
    mocks.client = buildClient([card(CARD_A, 'Mitosis')]);

    const result = await logQuiz({
      deck_id: DECK_ID, mode: 'mcq', duration_ms: 1000, include_in_history: true,
      results: [{ card_id: CARD_A, user_answer: 'Mitosis' }],
    });

    expect(result).toMatchObject({ success: true, correctCards: 1, totalCards: 1 });
  });

  it('scores a wrong MCQ answer as incorrect', async () => {
    mocks.client = buildClient([card(CARD_A, 'Mitosis')]);

    const result = await logQuiz({
      deck_id: DECK_ID, mode: 'mcq', duration_ms: 1000, include_in_history: true,
      results: [{ card_id: CARD_A, user_answer: 'Meiosis' }],
    });

    expect(result).toMatchObject({ success: true, correctCards: 0 });
  });

  it('cannot be told the answer was correct — there is no such input field', async () => {
    // The schema has no `correct` field, so a forged one is stripped by Zod and
    // the server re-derives correctness from cards.front. This is the guarantee
    // §2.5 of the plan calls out as already-good; this test pins it.
    mocks.client = buildClient([card(CARD_A, 'Mitosis')]);

    const result = await logQuiz({
      deck_id: DECK_ID, mode: 'mcq', duration_ms: 1000, include_in_history: true,
      results: [{ card_id: CARD_A, user_answer: 'definitely wrong', correct: true }],
    } as never);

    expect(result).toMatchObject({ success: true, correctCards: 0 });
  });

  it('is case- and whitespace-insensitive for MCQ', async () => {
    mocks.client = buildClient([card(CARD_A, 'Mitosis')]);

    const result = await logQuiz({
      deck_id: DECK_ID, mode: 'mcq', duration_ms: 1000, include_in_history: true,
      results: [{ card_id: CARD_A, user_answer: '  mitosis  ' }],
    });

    expect(result).toMatchObject({ correctCards: 1 });
  });

  it('accepts a near-miss in identification mode (>= 0.7 similarity)', async () => {
    mocks.client = buildClient([card(CARD_A, 'Mitochondria')]);

    const result = await logQuiz({
      deck_id: DECK_ID, mode: 'identification', duration_ms: 1000, include_in_history: true,
      results: [{ card_id: CARD_A, user_answer: 'mitocondria' }],
    });

    expect(result).toMatchObject({ correctCards: 1 });
  });

  it('rejects an unrelated identification answer', async () => {
    mocks.client = buildClient([card(CARD_A, 'Mitochondria')]);

    const result = await logQuiz({
      deck_id: DECK_ID, mode: 'identification', duration_ms: 1000, include_in_history: true,
      results: [{ card_id: CARD_A, user_answer: 'photosynthesis' }],
    });

    expect(result).toMatchObject({ correctCards: 0 });
  });

  it('does not accept a near-miss in MCQ mode, where options are exact', async () => {
    mocks.client = buildClient([card(CARD_A, 'Mitochondria')]);

    const result = await logQuiz({
      deck_id: DECK_ID, mode: 'mcq', duration_ms: 1000, include_in_history: true,
      results: [{ card_id: CARD_A, user_answer: 'mitocondria' }],
    });

    expect(result).toMatchObject({ correctCards: 0 });
  });

  it('rejects a malformed deck id before touching the database', async () => {
    mocks.client = buildClient([card(CARD_A, 'Mitosis')]);

    const result = await logQuiz({
      deck_id: 'not-a-uuid', mode: 'mcq', duration_ms: 1000, include_in_history: true,
      results: [{ card_id: CARD_A, user_answer: 'Mitosis' }],
    });

    expect(result).toHaveProperty('error');
  });

  it('refuses when the deck is not owned by the caller', async () => {
    mocks.client = buildClient([card(CARD_A, 'Mitosis')], {
      decks: { data: null, error: { message: 'no rows' } },
    });

    const result = await logQuiz({
      deck_id: DECK_ID, mode: 'mcq', duration_ms: 1000, include_in_history: true,
      results: [{ card_id: CARD_A, user_answer: 'Mitosis' }],
    });

    expect(result).toMatchObject({ error: expect.stringContaining('not found') });
  });

  it('passes the server-derived `correct` flag to the atomic RPC', async () => {
    // log_quiz_result folds the card schedule, study_logs, card_mastery_state
    // and both history rows into one transaction, and relies on this flag
    // being the server's verdict, not the client's.
    const client = buildClient([card(CARD_A, 'Mitosis')]);
    mocks.client = client;

    await logQuiz({
      deck_id: DECK_ID, mode: 'mcq', duration_ms: 1000, include_in_history: true,
      results: [{ card_id: CARD_A, user_answer: 'Mitosis' }],
    });

    const call = (client.rpc.mock.calls as unknown as unknown[][])
      .find((args) => args[0] === 'log_quiz_result');
    expect(call).toBeDefined();

    const payload = call![1] as {
      p_updates: Array<{ correct: boolean }>;
      p_card_results: Array<{ correct: boolean; correct_answer_text: string }>;
      p_mode: string;
    };
    expect(payload.p_updates[0].correct).toBe(true);
    expect(payload.p_card_results[0]).toMatchObject({ correct: true, correct_answer_text: 'Mitosis' });
    expect(payload.p_mode).toBe('mcq');
    // No direct history inserts remain: the RPC owns both tables.
    expect(client.__inserted.quiz_results).toBeUndefined();
    expect(client.__inserted.quiz_card_results).toBeUndefined();
  });
});
