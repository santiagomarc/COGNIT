import 'server-only';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { loadDueByDeckRows } from '@/lib/dashboard-due';

/**
 * Per-request memoisation of the reads every chromed route repeats.
 *
 * `React.cache` is scoped to one server render, so the shell layout, the page
 * and any nested server component share a single Supabase client, a single
 * identity check and a single due-cards breakdown. Before this a dashboard
 * render made three auth calls (proxy, layout, page) and ran
 * `get_due_cards_by_deck` twice.
 *
 * The proxy still verifies the session itself: it runs in a different runtime
 * before the render and is the only place that can refresh the cookie.
 */
export const getRequestClient = cache(async () => createClient());

/**
 * What the routes and actions need to know about the signed-in user. Every
 * field comes straight from the access token's claims, so none of them costs
 * a network call.
 */
export type SessionUser = {
  id: string;
  email: string | null;
  user_metadata: Record<string, unknown> | null;
};

/**
 * The signed-in user, verified locally.
 *
 * `getClaims()` checks the access token's signature against the project's
 * public signing keys — fetched once per instance and cached for ten minutes —
 * instead of asking the Auth server who the token belongs to. On a warm
 * function that is sub-millisecond crypto where `getUser()` was a full
 * round-trip, and it still refreshes an expired session the same way.
 *
 * The fallback is built in: while the project signs tokens with the legacy
 * HS256 shared secret there is no public key to check against, and the call
 * quietly degrades to `getUser()` — the old latency, never less safety. The
 * speed-up needs the project migrated to asymmetric signing keys (Supabase
 * Dashboard → Authentication → JWT Signing Keys).
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await getRequestClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data) return null;

  const { claims } = data;
  return {
    id: claims.sub,
    email: claims.email ?? null,
    user_metadata: claims.user_metadata ?? null,
  };
});

/**
 * One clock reading per request, so every "due now" the layout and the page
 * compute agrees to the millisecond — and so the cache below has a stable key.
 */
export const getRequestNow = cache(() => new Date());

/** Due cards per deck for the signed-in user, once per request. */
export const getDueByDeck = cache(async (userId: string) => {
  const supabase = await getRequestClient();
  return loadDueByDeckRows(supabase, userId, getRequestNow().toISOString());
});
