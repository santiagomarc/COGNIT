import { logger } from '@/lib/logger';

export type BackgroundOutcome = 'ok' | 'skipped' | 'failed';

/**
 * One `after()` callback with its outcome made countable (plan §6.6, LC-03):
 * a single `scope: "background"` log line per run carrying `task` and
 * `background: ok | skipped | failed`. `skipped` is a refused reservation or
 * nothing to do; a throw is `failed`. Count them in the Vercel logs:
 *
 *   scope:background  → group by task, background
 *
 * A `failed` share above a few percent is a timeout budget (LC-01) or a
 * model regression, and the scheduled live-AI job says which.
 *
 * Logs rather than ai_usage_logs rows: a completed call under a reservation
 * writes no row of its own, and extra rows would count against the user's
 * AI limits.
 */
export async function runBackground(
  task: string,
  work: () => Promise<BackgroundOutcome>,
  fields: Record<string, unknown> = {},
): Promise<void> {
  const startedAt = Date.now();
  try {
    const outcome = await work();
    logger.info('background', 'outcome', { task, background: outcome, ms: Date.now() - startedAt, ...fields });
  } catch (error) {
    logger.warn('background', 'outcome', {
      task,
      background: 'failed' satisfies BackgroundOutcome,
      ms: Date.now() - startedAt,
      ...fields,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
