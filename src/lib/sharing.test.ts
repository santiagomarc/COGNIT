import { describe, expect, it } from 'vitest';

import { createSupabaseMock } from '@/test/supabase-mock';
import { loadSharedDecks, sharedAgo } from './sharing';

const NOW = new Date('2026-10-01T12:00:00Z');

type Chain = Record<string, { mock: { calls: unknown[][] } }>;

describe('loadSharedDecks', () => {
  it('filters on the owner, because the sharing policy exposes every shared deck', async () => {
    const supabase = createSupabaseMock({ tables: { decks: { data: [], error: null } } });
    await loadSharedDecks(supabase as never, 'user-1', NOW);

    const chain = (supabase.from as unknown as { mock: { results: { value: Chain }[] } }).mock.results[0].value;
    expect(chain.eq.mock.calls).toContainEqual(['user_id', 'user-1']);
    expect(chain.eq.mock.calls).toContainEqual(['is_public', true]);
    expect(chain.not.mock.calls).toContainEqual(['share_token', 'is', null]);
  });

  it('maps rows, strips the tag and drops a row without a token', async () => {
    const supabase = createSupabaseMock({
      tables: {
        decks: {
          data: [
            { id: 'a', title: '[BIO] Cell Biology', share_token: 'tok', shared_at: '2026-09-28T12:00:00Z', listed_at: null, clone_count: 3 },
            { id: 'b', title: 'Orphan', share_token: null, shared_at: null, listed_at: null, clone_count: 0 },
          ],
          error: null,
        },
      },
    });

    expect(await loadSharedDecks(supabase as never, 'user-1', NOW)).toEqual([
      { id: 'a', title: 'Cell Biology', token: 'tok', sharedLabel: 'shared 3 days ago', listed: false, cloneCount: 3 },
    ]);
  });

  it('reads a failed query as nothing shared', async () => {
    const supabase = createSupabaseMock({ tables: { decks: { data: null, error: { message: 'boom' } } } });
    expect(await loadSharedDecks(supabase as never, 'user-1', NOW)).toEqual([]);
  });
});

describe('sharedAgo', () => {
  it('counts whole days in words', () => {
    expect(sharedAgo('2026-10-01T08:00:00Z', NOW)).toBe('shared today');
    expect(sharedAgo('2026-09-30T08:00:00Z', NOW)).toBe('shared yesterday');
    expect(sharedAgo('2026-09-19T12:00:00Z', NOW)).toBe('shared 12 days ago');
  });

  it('survives a missing or broken date', () => {
    expect(sharedAgo(null, NOW)).toBe('shared');
    expect(sharedAgo('not a date', NOW)).toBe('shared');
  });
});
