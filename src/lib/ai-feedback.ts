export function formatActionError(error: unknown, fallbackMessage: string): string {
  if (typeof error === 'string') {
    if (error.startsWith('AI limit reached for ')) {
      if (error.includes('generate cards')) {
        return 'You have reached your AI generation limit for now. Try again shortly, or add cards manually so you can keep studying.';
      }

      if (error.includes('sanitize notes')) {
        return 'AI cleaning is temporarily busy. You can still import your notes directly and fix flagged rows in preview.';
      }

      if (error.includes('enrich cards')) {
        return 'Quiz enhancement is temporarily limited. Your cards are still saved and can be used in study mode.';
      }

      if (error.includes('get hint')) {
        return 'Hint generation is temporarily limited. Try answering first, then request a hint again in a bit.';
      }

      return 'AI is temporarily rate-limited. Please try again shortly.';
    }

    if (/quota|too many requests|429/i.test(error)) {
      return 'AI is under heavy demand right now. Please try again in a little while.';
    }

    if (/unable to check ai usage limits/i.test(error)) {
      return 'AI service is temporarily unavailable. Please try again in a minute.';
    }

    return error;
  }

  if (error && typeof error === 'object') {
    const flattened = Object.values(error as Record<string, unknown>)
      .flatMap((value) => Array.isArray(value) ? value : [value])
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

    if (flattened.length > 0) {
      return flattened.join(', ');
    }
  }

  return fallbackMessage;
}
