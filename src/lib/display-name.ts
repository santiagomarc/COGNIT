/**
 * Resolving a name to greet the user by — without printing their email.
 *
 * Audit finding F-06 was specifically about the dashboard rendering a raw
 * address as page copy (`Welcome back, {user.email}`). This module exists so
 * that never happens again by accident: the greeting takes its name from here,
 * and here never returns an address.
 *
 * Verified against the schema before it was written: there is no `profiles`
 * table in `supabase/migrations/`, and `user_metadata` was referenced nowhere
 * in `src/`. OAuth providers populate `full_name` (Google) or `name`
 * (GitHub); **email/password signups populate neither**, so the local-part
 * branch is the common path on this product, not the edge case. If the
 * greeting becomes permanent, a real profile field is worth the migration.
 */

/** The shape this needs from a Supabase user. Kept structural so it is trivial to test. */
export type NameSource = {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

function firstWord(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  /*
   * Metadata is not trustworthy as a *name*. Some providers set `name` to the
   * account's email address when no display name has been chosen, and GitHub
   * does exactly that in a common configuration — so an address can reach the
   * page through the metadata branch rather than the fallback, which is F-06
   * arriving through a different door. Reject anything address-shaped and let
   * the caller fall through to the local-part path, which sanitises properly.
   */
  if (trimmed.includes('@')) return null;
  const first = trimmed.split(/\s+/)[0];
  return first.length > 0 ? first : null;
}

/**
 * A short, human first name, or `null` when there is nothing honest to use.
 *
 * `null` is a real answer and callers must render correctly for it — "Good
 * evening," with nothing after the comma is a bug, not a degraded state. It is
 * why the greeting carries no information and the sub-line carries all of it.
 */
export function resolveDisplayName(user: NameSource | null | undefined): string | null {
  if (!user) return null;

  const meta = user.user_metadata ?? {};

  // Google, and GitHub when the account has a display name set.
  const fullName = firstWord(meta.full_name);
  if (fullName) return fullName;

  // GitHub's fallback field.
  const name = firstWord(meta.name);
  if (name) return name;

  /*
   * Last resort: the local part of the address, and only the part before any
   * separator — `santiagomarcstephen@…` becomes "Santiago", not the address.
   * Digits are dropped so `marc92` does not greet someone as "Marc92".
   */
  const local = typeof user.email === 'string' ? user.email.split('@')[0] : '';
  const cleaned = local
    .replace(/[._\-+].*$/, '')
    .replace(/\d+/g, '')
    .trim();

  if (cleaned.length < 2) return null;

  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
}

/**
 * `morning` / `afternoon` / `evening` for a given local hour.
 *
 * Split out from the component so the boundaries are testable and so the
 * caller decides where "now" comes from — a server render and a client render
 * disagreeing about the timezone is a hydration mismatch, not a greeting.
 */
export function greetingForHour(hour: number): 'morning' | 'afternoon' | 'evening' {
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}
