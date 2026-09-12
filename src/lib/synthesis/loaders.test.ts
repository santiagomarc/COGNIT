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
