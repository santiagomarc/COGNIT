import type { GenerateContentResponse } from '@/lib/gemini';

/*
 * What one reservation's model calls cost, recorded beside it in
 * `ai_call_outcomes` (performance plan §4.2, AI-16). `ai_usage_logs` is an
 * immutable audit log whose rows count against the user's limits, so the
 * outcome cannot be written back onto the reservation; it gets its own row.
 *
 * A reservation with no outcome row is a call that failed or was abandoned:
 * the failure rate is a join, not something every call site has to report.
 */

/** Token totals across every model call one reservation made. */
export type AiUsageTotals = { input: number; output: number; thoughts: number };

/** What `recordAiUsage` writes beside the elapsed time. Every field is optional. */
export type AiCallOutcome = {
  usage?: AiUsageTotals | null;
  finishReason?: string | null;
  /** Streaming calls: ms from the reservation to the first delta. */
  ttftMs?: number | null;
};

/** Adds one response's `usageMetadata` to a running total. */
export function addUsage(
  total: AiUsageTotals | null,
  response: Pick<GenerateContentResponse, 'usageMetadata'>,
): AiUsageTotals {
  const meta = response.usageMetadata;
  const base = total ?? { input: 0, output: 0, thoughts: 0 };
  return {
    input: base.input + (meta?.promptTokenCount ?? 0),
    output: base.output + (meta?.candidatesTokenCount ?? 0),
    thoughts: base.thoughts + (meta?.thoughtsTokenCount ?? 0),
  };
}

export function finishReasonOf(response: Pick<GenerateContentResponse, 'candidates'>): string | null {
  return response.candidates?.[0]?.finishReason ?? null;
}
