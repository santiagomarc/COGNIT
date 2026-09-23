import 'server-only';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { loadDueByDeckRows } from '@/lib/dashboard-due';
import { logger } from '@/lib/logger';
import { verifiedClaims } from '@/lib/supabase/claims';

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
  const claims = await verifiedClaims(supabase);
  if (!claims) return null;

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

/**
 * Work queued with `after()` runs once the response has been flushed, when a
 * refreshed session can no longer reach the browser's cookies. supabase-js
 * refreshes on demand whenever the access token is within 90 s of expiry, and
 * Supabase rotates the refresh token when it does: a background write in that
 * window strands the browser on a revoked token, and reuse detection then
 * signs the user out. Call this before `after()` — if the token would enter
 * the window before the work can finish (maxDuration 60 s + the 90 s margin),
 * refresh it now, while this action can still set cookies.
 */
export async function ensureSessionHeadroom(minSeconds = 180): Promise<void> {
  try {
    const supabase = await getRequestClient();
    const { data } = await supabase.auth.getSession();
    const expiresAt = data.session?.expires_at;
    if (!expiresAt || expiresAt * 1000 - Date.now() >= minSeconds * 1000) return;
    const { error } = await supabase.auth.refreshSession();
    if (error) logger.warn('session', 'pre-background refresh failed', { message: error.message });
  } catch (error) {
    // Best-effort: the action it protects must never fail because of it.
    logger.warn('session', 'session headroom check skipped', { message: error instanceof Error ? error.message : String(error) });
  }
}

/** Due cards per deck for the signed-in user, once per request. */
export const getDueByDeck = cache(async (userId: string) => {
  const supabase = await getRequestClient();
  return loadDueByDeckRows(supabase, userId, getRequestNow().toISOString());
});
