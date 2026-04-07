type DbErrorLike = {
  code?: string | null;
  message?: string | null;
};

function normalize(input: string | null | undefined) {
  return (input ?? '').toLowerCase();
}

export function sanitizeDatabaseError(
  error: DbErrorLike | null | undefined,
  fallback = 'Failed to complete request. Please try again.'
) {
  if (!error) {
    return fallback;
  }

  const code = normalize(error.code);
  const message = normalize(error.message);

  if (code === '23505' || message.includes('duplicate key')) {
    return 'This item already exists.';
  }

  if (code === '23503' || message.includes('foreign key')) {
    return 'This action references data that no longer exists.';
  }

  if (code === '42501' || message.includes('permission denied') || message.includes('row-level security')) {
    return 'You do not have permission to perform this action.';
  }

  if (message.includes('does not exist') || message.includes('schema cache')) {
    return 'This feature is not available yet. Please try again shortly.';
  }

  return fallback;
}

export function sanitizeAiServiceError(
  rawMessage: string,
  fallback = 'AI service is temporarily unavailable. Please try again shortly.'
) {
  const message = normalize(rawMessage);

  if (message.includes('429') || message.includes('quota') || message.includes('too many requests')) {
    return 'AI is under heavy demand right now. Please try again in a little while.';
  }

  if (message.includes('api key') || message.includes('credential')) {
    return 'AI service is not configured correctly right now. Please try again later.';
  }

  if (message.includes('timeout') || message.includes('deadline')) {
    return 'AI request timed out. Please try again.';
  }

  return fallback;
}
