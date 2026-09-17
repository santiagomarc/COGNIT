import 'server-only';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { loadDueByDeckRows } from '@/lib/dashboard-due';

/**
 * Per-request memoisation of the reads every chromed route repeats.
 *
 * `React.cache` is scoped to one server render, so the shell layout, the page
 * and any nested server component share a single Supabase client, a single
 * `auth.getUser()` round-trip (a network call to Supabase Auth) and a single
 * due-cards breakdown. Before this a dashboard render made three auth calls
 * (proxy, layout, page) and ran `get_due_cards_by_deck` twice.
 *
 * The proxy still calls `getUser()` itself: it runs in a different runtime
 * before the render and is the only place that can refresh the cookie.
 */
export const getRequestClient = cache(async () => createClient());

export const getSessionUser = cache(async () => {
  const supabase = await getRequestClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
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
