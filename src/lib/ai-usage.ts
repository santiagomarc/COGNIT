/**
 * The daily AI budget, as the account menu and Settings → Usage & privacy
 * show it (sidebar plan §5.8, SET-07).
 *
 * The ceiling moves here from `src/app/actions/_shared.ts`, which imports the
 * server session and so cannot reach a client component. `_shared.ts`
 * re-imports it; there is still exactly one number.
 */

/**
 * Model calls per user over a rolling 24 hours, across every action.
 * Enforced inside `reserve_ai_call` (202609170900) under an advisory lock.
 */
export const DAILY_AI_CALL_CEILING = 300;

export const AI_USAGE_WINDOW_HOURS = 24;

/** What `get_ai_usage_summary` returns (202610010910). */
export type AiUsageRow = { calls_used: number | null; oldest_call_at: string | null };

export type AiUsageReading = {
  used: number;
  ceiling: number;
  remaining: number;
  /** 0–1, for the meter. */
  fraction: number;
  atLimit: boolean;
  /**
   * When the oldest call in the window leaves it and frees its share. Null
   * with no calls in the window. It frees that call's share only — the
   * window rolls, it does not reset at midnight.
   */
  nextFreesAt: Date | null;
};

export function aiUsageReading(row: AiUsageRow | null | undefined, ceiling = DAILY_AI_CALL_CEILING): AiUsageReading {
  const used = Math.max(0, Math.floor(Number(row?.calls_used ?? 0)) || 0);
  const safeCeiling = Math.max(1, Math.floor(ceiling));
  const oldest = row?.oldest_call_at ? new Date(row.oldest_call_at) : null;
  const nextFreesAt =
    oldest && !Number.isNaN(oldest.getTime()) && used > 0
      ? new Date(oldest.getTime() + AI_USAGE_WINDOW_HOURS * 60 * 60 * 1000)
      : null;

  return {
    used,
    ceiling: safeCeiling,
    remaining: Math.max(0, safeCeiling - used),
    fraction: Math.min(1, used / safeCeiling),
    atLimit: used >= safeCeiling,
    nextFreesAt,
  };
}
