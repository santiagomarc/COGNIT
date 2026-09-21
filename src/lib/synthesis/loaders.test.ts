import { describe, expect, it, vi } from 'vitest';
import { createSupabaseMock } from '@/test/supabase-mock';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const NOW = new Date('2026-09-12T12:00:00Z');

describe('loadCapstoneCandidates', () => {
  it('projects active drills to the lean capstone shape and drops a drill with fewer than two cards', async () => {
    const supabase = createSupabaseMock({
      tables: {
        synthesis_drills: {
          data: [
            { id: 'd1', prompt_text: 'By what mechanism…', card_ids: ['a', 'b'], next_due_at: NOW.toISOString(), attempt_count: 2 },
            { id: 'orphan', prompt_text: 'p', card_ids: ['a'], next_due_at: NOW.toISOString(), attempt_count: 0 },
          ],
          error: null,
        },
      },
    });
    const { loadCapstoneCandidates } = await import('./loaders');

    const candidates = await loadCapstoneCandidates(supabase as never, { deckId: 'deck', userId: 'user-1' });

    expect(candidates).toEqual([
      { id: 'd1', promptText: 'By what mechanism…', cardIds: ['a', 'b'], status: 'active', nextDueAt: NOW.toISOString(), attemptCount: 2 },
    ]);
    // Never the answer key: the read names its columns.
    const chain = supabase.from.mock.results[0]?.value as { select: ReturnType<typeof vi.fn> };
    expect(chain.select).toHaveBeenCalledWith('id, prompt_text, card_ids, next_due_at, attempt_count');
  });

  it('returns nothing, not a throw, when the table is unavailable', async () => {
    const supabase = createSupabaseMock({
      tables: { synthesis_drills: { data: null, error: { message: 'relation "synthesis_drills" does not exist', code: '42P01' } } },
    });
    const { loadCapstoneCandidates } = await import('./loaders');
    await expect(loadCapstoneCandidates(supabase as never, { deckId: 'deck', userId: 'user-1' })).resolves.toEqual([]);
  });
});

describe('loadDueDrillsByDeck', () => {
  it('groups due drills by deck, most due first, and scopes the read to the user and the clock', async () => {
    const supabase = createSupabaseMock({
      tables: {
        synthesis_drills: {
          data: [{ deck_id: 'b' }, { deck_id: 'a' }, { deck_id: 'b' }, { deck_id: 'c' }],
          error: null,
        },
      },
    });
    const { loadDueDrillsByDeck } = await import('./loaders');

    const result = await loadDueDrillsByDeck(supabase as never, { userId: 'user-1', now: NOW });

    expect(result).toEqual({
      decks: [{ deckId: 'b', dueCount: 2 }, { deckId: 'a', dueCount: 1 }, { deckId: 'c', dueCount: 1 }],
      total: 4,
      truncated: false,
    });
    const chain = supabase.from.mock.results[0]?.value as Record<string, ReturnType<typeof vi.fn>>;
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(chain.eq).toHaveBeenCalledWith('status', 'active');
    expect(chain.lte).toHaveBeenCalledWith('next_due_at', NOW.toISOString());
  });

  it('is empty and quiet on a read error', async () => {
    const supabase = createSupabaseMock({
      tables: { synthesis_drills: { data: null, error: { message: 'boom' } } },
    });
    const { loadDueDrillsByDeck } = await import('./loaders');
    await expect(loadDueDrillsByDeck(supabase as never, { userId: 'user-1', now: NOW })).resolves.toEqual({
      decks: [],
      total: 0,
      truncated: false,
    });
  });
});

describe('loadSynthesisQueue — worked example and history', () => {
  const DRILL = {
    id: 'd1', deck_id: 'deck', kind: 'drill', question_text: null, command_word: null, format: 'causal', prompt_text: 'By what mechanism does Time quantum shape an Interactive process?',
    prompt_variants: ['Explain how the Time quantum shapes an Interactive process.'], scenario: null, bloom: 'analyse',
    card_ids: ['a', 'b'], topic_tag: null,
    required_links: [{ id: 'm1', text: 'l1', card_ids: ['a'] }, { id: 'm2', text: 'l2', card_ids: ['b'], kind: 'condition', core: true }],
    exemplar: { claim: 'c', mechanisms: ['m', 'm'], tradeoff: 't' },
    status: 'active', step: 0, next_due_at: NOW.toISOString(), attempt_count: 1, last_verdict: 'partial', last_attempt_at: NOW.toISOString(),
  };
  const CARDS = [
    { id: 'a', front: 'Time quantum', back: 'slice', explanation: null, state: 'review' },
    { id: 'b', front: 'Interactive process', back: 'bursts', explanation: null, state: 'new' },
  ];
  const ATTEMPTS = [
    { id: 'x2', drill_id: 'd1', verdict: 'partial', gap_note: 'g', coverage: [{ link_id: 'm1', status: 'covered', evidence: null }, { link_id: 'm2', status: 'missing', evidence: null }], created_at: '2026-09-11T00:00:00Z' },
    { id: 'x1', drill_id: 'd1', verdict: 'sound', gap_note: '', coverage: [{ link_id: 'm1', status: 'covered', evidence: null }, { link_id: 'm2', status: 'covered', evidence: null }], created_at: '2026-09-10T00:00:00Z' },
  ];

  it('reads legacy links as mechanism/core, serves the variant for the attempt count, and lists the history newest first', async () => {
    const supabase = createSupabaseMock({
      tables: {
        synthesis_drills: { data: [DRILL], error: null },
        cards: { data: CARDS, error: null },
        synthesis_attempts: { data: ATTEMPTS, error: null, count: 2 },
      },
    });
    const { loadSynthesisQueue, toCanvasDrill } = await import('./loaders');
    const queue = await loadSynthesisQueue(supabase as never, { deckId: 'deck', userId: 'user-1', count: 3, now: NOW });

    expect(queue.drills[0].requiredLinks[0]).toMatchObject({ kind: 'mechanism', core: true });
    expect(queue.drills[0].requiredLinks[1]).toMatchObject({ kind: 'condition', core: true });
    expect(queue.workedExample).toBeNull();                                   // the deck has attempts
    expect(queue.historyByDrill.d1.map((entry) => entry.verdict)).toEqual(['partial', 'sound']);
    expect(queue.lastAttemptByDrill.d1.attemptId).toBe('x2');

    const canvas = toCanvasDrill(queue.drills[0]);
    expect(canvas.promptVariant).toBe(1);                                     // attempt_count 1 → the first variant
    expect(canvas.promptText).toBe('Explain how the Time quantum shapes an Interactive process.');
    expect(canvas.linkKinds).toEqual(['mechanism', 'condition']);
    expect(canvas).not.toHaveProperty('exemplar');
  });

  it('offers the first drill\'s exemplar as a worked example while the deck has no attempts', async () => {
    const supabase = createSupabaseMock({
      tables: {
        synthesis_drills: { data: [{ ...DRILL, attempt_count: 0 }], error: null },
        cards: { data: CARDS, error: null },
        synthesis_attempts: { data: [], error: null, count: 0 },
      },
    });
    const { loadSynthesisQueue } = await import('./loaders');
    const queue = await loadSynthesisQueue(supabase as never, { deckId: 'deck', userId: 'user-1', count: 3, now: NOW });
    expect(queue.workedExample).toEqual({ claim: 'c', mechanisms: ['m', 'm'], tradeoff: 't' });
    expect(queue.historyByDrill).toEqual({});
  });
});
