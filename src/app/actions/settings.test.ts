import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createSupabaseMock } from '@/test/supabase-mock';

const USER = { id: 'user-1' };
const EMAIL = 'me@example.com';

const mocks = vi.hoisted(() => ({
  client: null as unknown,
  admin: null as unknown,
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
  resetPassword: vi.fn(async () => ({ success: true, message: 'sent' })),
}));

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => mocks.client }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => mocks.admin }));
vi.mock('@/app/auth/actions', () => ({ resetPassword: mocks.resetPassword }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));

type Mock = ReturnType<typeof createSupabaseMock> & { auth: Record<string, unknown> };

function client(options: { email?: string | null; providers?: string[]; signedOut?: boolean; rpcs?: NonNullable<Parameters<typeof createSupabaseMock>[0]>['rpcs'] } = {}) {
  const mock = createSupabaseMock({ user: options.signedOut ? null : USER, rpcs: options.rpcs }) as Mock;
  if (!options.signedOut) {
    mock.auth.getClaims = vi.fn(async () => ({
      data: { claims: { sub: USER.id, email: options.email ?? EMAIL, app_metadata: { providers: options.providers ?? ['email'] } } },
      error: null,
    }));
  }
  mock.auth.signOut = vi.fn(async () => ({ error: null }));
  mocks.client = mock;
  return mock;
}

/** The payload the action passed to `.upsert()` on user_settings. */
function upserted(mock: Mock) {
  const from = mock.from as unknown as { mock: { calls: string[][]; results: { value: { upsert: { mock: { calls: unknown[][] } } } }[] } };
  const index = from.mock.calls.findIndex(([table]) => table === 'user_settings');
  return from.mock.results[index]?.value.upsert.mock.calls[0];
}

const importSettings = () => import('./settings');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.admin = null;
});

describe('updateDisplayName', () => {
  it('upserts the normalised name, keyed on the user', async () => {
    const mock = client();
    const { updateDisplayName } = await importSettings();
    await expect(updateDisplayName('  Dr.   Santiago ')).resolves.toMatchObject({ success: true, displayName: 'Dr. Santiago' });
    const [payload, options] = upserted(mock) as [Record<string, unknown>, Record<string, unknown>];
    expect(payload).toMatchObject({ user_id: USER.id, display_name: 'Dr. Santiago' });
    expect(payload).not.toHaveProperty('session_card_count');
    expect(options).toEqual({ onConflict: 'user_id' });
  });

  it('saves a cleared name as null, which means "derive it"', async () => {
    const mock = client();
    const { updateDisplayName } = await importSettings();
    await updateDisplayName('   ');
    expect((upserted(mock) as [Record<string, unknown>])[0].display_name).toBeNull();
  });

  it('refuses an address and a signed-out caller', async () => {
    client();
    const { updateDisplayName } = await importSettings();
    await expect(updateDisplayName('me@example.com')).resolves.toMatchObject({ error: expect.stringContaining('email') });
    client({ signedOut: true });
    await expect(updateDisplayName('Marc')).resolves.toMatchObject({ error: 'You must be logged in.' });
  });
});

describe('updateStudyDefaults', () => {
  it('writes both values and nothing else', async () => {
    const mock = client();
    const { updateStudyDefaults } = await importSettings();
    await expect(updateStudyDefaults({ sessionCardCount: 20, newCardsPerSession: 8 })).resolves.toMatchObject({ success: true });
    const [payload] = upserted(mock) as [Record<string, unknown>];
    expect(payload).toMatchObject({ session_card_count: 20, new_cards_per_session: 8 });
    expect(payload).not.toHaveProperty('display_name');
  });

  it('refuses out-of-range values before touching the database', async () => {
    const mock = client();
    const { updateStudyDefaults } = await importSettings();
    await expect(updateStudyDefaults({ sessionCardCount: 80, newCardsPerSession: 5 })).resolves.toMatchObject({ success: false });
    expect(mock.from).not.toHaveBeenCalled();
  });
});

describe('getAiUsage', () => {
  it('reads the rolling window and reports when the oldest call frees', async () => {
    client({ rpcs: { get_ai_usage_summary: { data: [{ calls_used: 38, oldest_call_at: '2026-10-01T08:00:00Z' }], error: null } } });
    const { getAiUsage } = await importSettings();
    await expect(getAiUsage()).resolves.toEqual({
      success: true,
      used: 38,
      ceiling: 300,
      nextFreesAt: '2026-10-02T08:00:00.000Z',
    });
  });
});

describe('sendPasswordResetLink', () => {
  it('sends to the session address for a password account', async () => {
    client();
    const { sendPasswordResetLink } = await importSettings();
    await expect(sendPasswordResetLink()).resolves.toMatchObject({ success: true });
    expect(mocks.resetPassword).toHaveBeenCalledWith({ email: EMAIL });
  });

  it('refuses an OAuth-only account', async () => {
    client({ providers: ['google'] });
    const { sendPasswordResetLink } = await importSettings();
    await expect(sendPasswordResetLink()).resolves.toMatchObject({ error: expect.stringContaining('without a password') });
    expect(mocks.resetPassword).not.toHaveBeenCalled();
  });
});

describe('signOutEverywhere', () => {
  it('revokes every session, then leaves for the login page', async () => {
    const mock = client();
    const { signOutEverywhere } = await importSettings();
    await expect(signOutEverywhere()).rejects.toThrow('NEXT_REDIRECT /login');
    expect(mock.auth.signOut).toHaveBeenCalledWith({ scope: 'global' });
  });
});

describe('deleteAccount', () => {
  const adminWith = (error: { message: string } | null = null) => {
    const deleteUser = vi.fn(async () => ({ data: {}, error }));
    mocks.admin = { auth: { admin: { deleteUser } } };
    return deleteUser;
  };

  it('does nothing unless the typed email matches', async () => {
    client();
    const deleteUser = adminWith();
    const { deleteAccount } = await importSettings();
    await expect(deleteAccount({ confirmation: 'someone@else.com' })).resolves.toMatchObject({ error: expect.stringContaining('Nothing was deleted') });
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('is unavailable without the service-role key', async () => {
    client();
    const { deleteAccount } = await importSettings();
    await expect(deleteAccount({ confirmation: EMAIL })).resolves.toMatchObject({ error: expect.stringContaining('not available') });
  });

  it('keeps the user signed in and says so when deletion fails', async () => {
    const mock = client();
    adminWith({ message: 'boom' });
    const { deleteAccount } = await importSettings();
    await expect(deleteAccount({ confirmation: EMAIL })).resolves.toMatchObject({ error: expect.stringContaining('was not deleted') });
    expect(mock.auth.signOut).not.toHaveBeenCalled();
  });

  it('deletes this user, clears the local session and leaves', async () => {
    const mock = client();
    const deleteUser = adminWith();
    const { deleteAccount } = await importSettings();
    await expect(deleteAccount({ confirmation: ` ${EMAIL.toUpperCase()} ` })).rejects.toThrow('NEXT_REDIRECT /?account=deleted');
    expect(deleteUser).toHaveBeenCalledWith(USER.id);
    expect(mock.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });
});

describe('the service-role client stays in one place', () => {
  it('is imported by settings.ts and nothing else', () => {
    const root = path.resolve(__dirname, '../..');
    const importers: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && readFileSync(full, 'utf8').includes('@/lib/supabase/admin')) {
          importers.push(path.relative(root, full));
        }
      }
    };
    walk(root);
    expect(importers).toEqual([path.join('app', 'actions', 'settings.ts')]);
  });
});
