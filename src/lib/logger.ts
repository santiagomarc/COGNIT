type LogFields = Record<string, unknown>;

function emit(level: 'warn' | 'error', scope: string, message: string, fields?: LogFields) {
  const entry = { level, scope, message, ...fields, ts: new Date().toISOString() };
  // Structured JSON so Vercel/Datadog parse it as fields, not as a string blob.
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else console.warn(line);
}

export const logger = {
  warn: (scope: string, message: string, fields?: LogFields) => emit('warn', scope, message, fields),
  error: (scope: string, message: string, fields?: LogFields) => emit('error', scope, message, fields),
};
