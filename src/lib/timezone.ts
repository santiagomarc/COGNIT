/*
 * A day is the user's day (UIUX plan UX-06). The streak, "reviewed today", the
 * heatmap and the forecast used to cut days at UTC midnight, which is 8 am in
 * UTC+8: a user who studied at 7 am had studied "yesterday". The browser's
 * zone travels in a cookie (`TimezoneCookie`) and the server reads it
 * (`request-timezone.ts`); everything here is pure, so a client component may
 * import it too.
 */

export const TZ_COOKIE = 'cognit-tz';

/** The IANA zone in `raw`, or 'UTC' when it is missing or unknown. An unknown zone makes Postgres's `at time zone` raise. */
export function parseTimeZone(raw: string | undefined | null): string {
  if (!raw || raw.length > 64) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: raw });
    return raw;
  } catch {
    return 'UTC';
  }
}

/** `YYYY-MM-DD` for `date` in `timeZone`: the day key `get_study_activity_days` returns. */
export function localDayKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

const DAY_MS = 86_400_000;

function keyMs(key: string): number {
  return Date.parse(`${key}T00:00:00Z`);
}

/** The day key `days` after `key` (before, if negative). Calendar arithmetic on the key: no zone, so no DST edge. */
export function shiftDayKey(key: string, days: number): string {
  return new Date(keyMs(key) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`. */
export function dayKeyDiff(to: string, from: string): number {
  return Math.round((keyMs(to) - keyMs(from)) / DAY_MS);
}
