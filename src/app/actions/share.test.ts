import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseMock } from '@/test/supabase-mock';

const DECK_ID = '00000000-0000-4000-8000-000000000001';
const TOKEN = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';

const mocks = vi.hoisted(() => ({ client: null as unknown }));

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => mocks.client }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

async function importShare() {
  return import('./share');
}

describe('setDeckSharing', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the generated token for an owned deck', async () => {
    mocks.client = createSupabaseMock({
      tables: { decks: { data: { id: DECK_ID, title: 'Deck' }, error: null } },
      rpcs: { set_deck_sharing: { data: TOKEN, error: null } },
    });

    const { setDeckSharing } = await importShare();
    const result = await setDeckSharing({ deck_id: DECK_ID, enabled: true, rotate: false });

    expect(result).toMatchObject({ success: true, shareToken: TOKEN });
  });

  it('refuses a deck the caller does not own', async () => {
    // requireOwnedDeck filters on user_id, so a non-owner sees no row at all.
    mocks.client = createSupabaseMock({
      tables: { decks: { data: null, error: { message: 'no rows returned' } } },
    });

    const { setDeckSharing } = await importShare();
    const result = await setDeckSharing({ deck_id: DECK_ID, enabled: true, rotate: false });

    expect(result).toMatchObject({ error: expect.stringContaining('not found') });
  });

  it('refuses an anonymous caller', async () => {
    mocks.client = createSupabaseMock({ user: null });

    const { setDeckSharing } = await importShare();
    const result = await setDeckSharing({ deck_id: DECK_ID, enabled: true, rotate: false });

    expect(result).toMatchObject({ error: expect.stringContaining('logged in') });
  });

  it('returns a null token when sharing is turned off', async () => {
    mocks.client = createSupabaseMock({
      tables: { decks: { data: { id: DECK_ID, title: 'Deck' }, error: null } },
      rpcs: { set_deck_sharing: { data: null, error: null } },
    });

    const { setDeckSharing } = await importShare();
    const result = await setDeckSharing({ deck_id: DECK_ID, enabled: false, rotate: false });

    expect(result).toMatchObject({ success: true, shareToken: null });
  });

  it('rejects a malformed deck id', async () => {
    mocks.client = createSupabaseMock();
    const { setDeckSharing } = await importShare();
    const result = await setDeckSharing({ deck_id: 'nope', enabled: true, rotate: false });
    expect(result).toHaveProperty('error');
  });
});

describe('cloneSharedDeck', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the new deck id on success', async () => {
    mocks.client = createSupabaseMock({
      rpcs: { clone_shared_deck: { data: 'new-deck-id', error: null } },
    });

    const { cloneSharedDeck } = await importShare();
    expect(await cloneSharedDeck(TOKEN)).toMatchObject({ success: true, deckId: 'new-deck-id' });
  });

  it('requires a signed-in user', async () => {
    mocks.client = createSupabaseMock({ user: null });

    const { cloneSharedDeck } = await importShare();
    expect(await cloneSharedDeck(TOKEN)).toMatchObject({
      error: expect.stringContaining('Sign in'),
    });
  });

  it('surfaces the un-shared case in plain language', async () => {
    mocks.client = createSupabaseMock({
      rpcs: { clone_shared_deck: { data: null, error: { message: 'This deck is no longer shared.' } } },
    });

    const { cloneSharedDeck } = await importShare();
    expect(await cloneSharedDeck(TOKEN)).toMatchObject({
      error: 'This deck is no longer shared.',
    });
  });

  it('surfaces the size limit in plain language', async () => {
    mocks.client = createSupabaseMock({
      rpcs: { clone_shared_deck: { data: null, error: { message: 'Deck is too large to clone (limit 1000 cards).' } } },
    });

    const { cloneSharedDeck } = await importShare();
    expect(await cloneSharedDeck(TOKEN)).toMatchObject({
      error: expect.stringContaining('too large'),
    });
  });

  it.each([
    ['empty', ''],
    ['too short', 'abc123'],
    ['non-hex', 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz'],
    ['sql-ish', "' or 1=1 --"],
  ])('rejects a %s token without hitting the database', async (_label, token) => {
    // A 32-char hex shape is enforced client-side too, so a malformed token
    // never reaches the RPC.
    const client = createSupabaseMock();
    mocks.client = client;

    const { cloneSharedDeck } = await importShare();
    const result = await cloneSharedDeck(token);

    expect(result).toMatchObject({ error: expect.stringContaining('not valid') });
    expect(client.rpc).not.toHaveBeenCalled();
  });
});
