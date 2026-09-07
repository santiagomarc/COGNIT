import { AiServiceError, aiFailureMessage, classifyAiError } from '@/lib/ai-retry';
import { logger } from '@/lib/logger';

export type ActionFailure = { error: string; success?: false };

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
      return {
        error: typeof res.error === 'string' ? res.error : JSON.stringify(res.error),
        success: false,
      };
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

