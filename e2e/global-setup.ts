import fs from 'node:fs';
import { createServerClient } from '@supabase/ssr';

import type { Database } from '../src/lib/database.types';
import { seedFixtureDeck } from './seed';
import { AUTH_DIR, USER_STATE, writeFixture } from './state';

/*
 * Signs the test account in, seeds the fixture deck and writes the browser
 * state the signed-in specs load (UIUX plan §4.3). Without the account, only
 * the public pages run: the signed-in specs skip and say why. It never
 * creates an account.
 */
export default async function globalSetup() {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  // An empty state first, so a spec that opts into it never finds the file missing.
  fs.writeFileSync(USER_STATE, JSON.stringify({ cookies: [], origins: [] }));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const email = process.env.LOAD_TEST_EMAIL;
  const password = process.env.LOAD_TEST_PASSWORD;

  if (!url || !anon || !email || !password) {
    const reason = 'no test account: set LOAD_TEST_EMAIL and LOAD_TEST_PASSWORD in .env.local';
    writeFixture({ signedIn: false, reason });
    console.warn(`[e2e] ${reason}. Signed-in specs will skip.`);
    return;
  }

  // The cookie jar scripts/k6-session.mjs uses: @supabase/ssr writes exactly
  // the cookies the proxy reads, chunking included.
  const jar = new Map<string, string>();
  const supabase = createServerClient<Database>(url, anon, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => cookies.forEach(({ name, value }) => jar.set(name, value)),
    },
  });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signing in the test account: ${error.message}`);

  const deckId = await seedFixtureDeck(supabase, data.user.id);

  const cookies = [...jar].map(([name, value]) => ({
    name,
    value,
    domain: 'localhost',
    path: '/',
    expires: -1,
    httpOnly: false,
    secure: false,
    sameSite: 'Lax' as const,
  }));
  fs.writeFileSync(USER_STATE, JSON.stringify({ cookies, origins: [] }));
  writeFixture({ signedIn: true, deckId });
}
