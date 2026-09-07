type LogFields = Record<string, unknown>;

type LogLevel = 'info' | 'warn' | 'error';

function emit(level: LogLevel, scope: string, message: string, fields?: LogFields) {
  const entry = { level, scope, message, ...fields, ts: new Date().toISOString() };
  // Structured JSON so Vercel/Datadog parse it as fields, not as a string blob.
  const line = JSON.stringify(entry);

  // This is the seam for an error tracker. Deliberately not wired to one yet:
  // Vercel captures stdout/stderr as structured logs, and error.tsx /
  // dashboard/error.tsx already surface `error.digest` for correlation, which
  // covers this app's current volume. Add a tracker when alerting is needed,
  // not before — e.g.
  //   if (level === 'error' && process.env.SENTRY_DSN) Sentry.captureMessage(message, { extra: entry });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.info(line);
}

export const logger = {
  info: (scope: string, message: string, fields?: LogFields) => emit('info', scope, message, fields),
  warn: (scope: string, message: string, fields?: LogFields) => emit('warn', scope, message, fields),
  error: (scope: string, message: string, fields?: LogFields) => emit('error', scope, message, fields),
};
