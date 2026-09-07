import { AiServiceError, aiFailureMessage, classifyAiError } from '@/lib/ai-retry';
import { logger } from '@/lib/logger';

/**
 * Zod's `flatten().fieldErrors` shape. Kept structured all the way to the
 * client so `formatActionError` can flatten it into readable copy — stringify
 * it here and the user sees raw JSON in a toast.
 */
export type FieldErrors = Record<string, string[] | undefined>;

export type ActionFailure = { error: string | FieldErrors; success?: false };

function isFieldErrors(value: unknown): value is FieldErrors {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>).every(
    (entry) => entry === undefined
      || (Array.isArray(entry) && entry.every((item) => typeof item === 'string')),
  );
}

/**
 * Guarantees a Server Action resolves rather than rejects.
 * Every AI-touching action must be wrapped: a rejected action surfaces as an
 * opaque 500 in the client, and the callers in DeckChatWidget /
 * SemanticSearchModal never reset their loading state (findings R-2, R-3).
 */
export async function guardAction<T extends object>(
  feature: string,
  run: () => Promise<T | ActionFailure | { error: unknown }>,
): Promise<T | ActionFailure> {
  try {
    const res = await run();

    if ('error' in res && res.error) {
      // Strings and Zod field-error maps both pass through untouched;
      // formatActionError knows how to render each. Anything else is an
      // unexpected shape, so fall back to generic copy rather than leaking it.
      if (typeof res.error === 'string' || isFieldErrors(res.error)) {
        return { error: res.error, success: false };
      }

      logger.error(`action:${feature}`, 'unrecognised error shape', {
        error: JSON.stringify(res.error),
      });
      return { error: aiFailureMessage('unknown', feature), success: false };
    }

    return res as T;
  } catch (error) {
    const kind = error instanceof AiServiceError ? error.kind : classifyAiError(error);
    logger.error(`action:${feature}`, 'unhandled action failure', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { error: aiFailureMessage(kind, feature), success: false };
  }
}
