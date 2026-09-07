/**
 * Single retry/backoff/classification layer for every Gemini call.
 * Rationale: eight call sites in src/app/actions/* each invoke the SDK
 * directly, so a 429 fails differently in each one. Route all of them here.
 */

import { logger } from '@/lib/logger';

export type AiFailureKind =
  | 'rate_limited'      // 429 / quota — retryable, user-visible "busy"
  | 'unavailable'       // 5xx / network — retryable
  | 'timeout'           // deadline exceeded — retryable
  | 'bad_request'       // 400 — NOT retryable (prompt/schema bug)
  | 'unauthenticated'   // 401/403 — NOT retryable (config)
  | 'malformed_output'  // JSON.parse or schema mismatch — retry once
  | 'unknown';

export class AiServiceError extends Error {
  readonly kind: AiFailureKind;
  readonly attempts: number;
  constructor(kind: AiFailureKind, message: string, attempts: number) {
    super(message);
    this.name = 'AiServiceError';
    this.kind = kind;
    this.attempts = attempts;
  }
}

const RETRYABLE: ReadonlySet<AiFailureKind> = new Set([
  'rate_limited', 'unavailable', 'timeout', 'malformed_output',
]);

export function classifyAiError(error: unknown): AiFailureKind {
  const raw = error instanceof Error ? error.message : String(error);
  const message = raw.toLowerCase();

  if (error instanceof SyntaxError) return 'malformed_output';
  if (message.includes('429') || message.includes('quota') || message.includes('too many requests')) {
    return 'rate_limited';
  }
  if (message.includes('401') || message.includes('403')
    || message.includes('api key') || message.includes('permission')) {
    return 'unauthenticated';
  }
  if (message.includes('400') || message.includes('invalid argument')) return 'bad_request';
  if (message.includes('timeout') || message.includes('deadline')) return 'timeout';
  if (/\b5\d\d\b/.test(message) || message.includes('unavailable')
    || message.includes('overloaded') || message.includes('fetch failed')) {
    return 'unavailable';
  }
  return 'unknown';
}

export type RetryOptions = {
  /** Total attempts including the first. Default 3. */
  maxAttempts?: number;
  /** Base delay in ms; doubles each attempt. Default 500. */
  baseDelayMs?: number;
  /** Ceiling per sleep. Default 8_000. */
  maxDelayMs?: number;
  /** Label used in server logs. */
  label: string;
  signal?: AbortSignal;
};

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Aborted'));
    const id = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(id);
      reject(new Error('Aborted'));
    }, { once: true });
  });
}

/**
 * Runs `operation` with exponential backoff + full jitter.
 * Full jitter (not fixed backoff) matters here: enrichment fans out 3
 * concurrent batches, and fixed delays would resynchronise them into the
 * same retry window that just rate-limited them.
 */
export async function withGeminiRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 500;
  const maxDelayMs = options.maxDelayMs ?? 8_000;

  let lastKind: AiFailureKind = 'unknown';
  let lastMessage = 'AI request failed.';

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastKind = classifyAiError(error);
      lastMessage = error instanceof Error ? error.message : String(error);

      const isLastAttempt = attempt === maxAttempts;
      if (!RETRYABLE.has(lastKind) || isLastAttempt) {
        logger.error(`ai:${options.label}`, `${lastKind} after ${attempt} attempt(s)`, { error: lastMessage });
        throw new AiServiceError(lastKind, lastMessage, attempt);
      }

      const backoff = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      const jittered = Math.floor(Math.random() * backoff);
      logger.warn(`ai:${options.label}`, `${lastKind}, retry ${attempt}/${maxAttempts - 1} in ${jittered}ms`);
      await sleep(jittered, options.signal);
    }
  }

  throw new AiServiceError(lastKind, lastMessage, maxAttempts);
}

/** Maps a failure to the exact copy the user sees. Never leaks provider text. */
export function aiFailureMessage(kind: AiFailureKind, feature: string): string {
  switch (kind) {
    case 'rate_limited':
      return `${feature} is under heavy demand right now. Please try again in a minute.`;
    case 'unavailable':
    case 'timeout':
      return `${feature} took too long to respond. Please try again.`;
    case 'unauthenticated':
    case 'bad_request':
      return `${feature} is temporarily unavailable. We've been notified.`;
    case 'malformed_output':
      return `${feature} returned an unexpected response. Please try again.`;
    default:
      return `${feature} failed. Please try again shortly.`;
  }
}
