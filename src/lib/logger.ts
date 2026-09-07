type LogFields = Record<string, unknown>;

type LogLevel = 'info' | 'warn' | 'error';

function emit(level: LogLevel, scope: string, message: string, fields?: LogFields) {
  const entry = { level, scope, message, ...fields, ts: new Date().toISOString() };
  // Structured JSON so Vercel/Datadog parse it as fields, not as a string blob.
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.info(line);
}

export const logger = {
  info: (scope: string, message: string, fields?: LogFields) => emit('info', scope, message, fields),
  warn: (scope: string, message: string, fields?: LogFields) => emit('warn', scope, message, fields),
  error: (scope: string, message: string, fields?: LogFields) => emit('error', scope, message, fields),
};
