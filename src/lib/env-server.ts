import 'server-only';
import { z } from 'zod';

/**
 * Server-only environment. Kept separate from env-public.ts because that module
 * is imported from browser code (src/lib/supabase/client.ts), where none of
 * these variables exist.
 *
 * Validating here turns "the AI silently fails on the first user request" into
 * "the server refuses to start", which is the failure mode you want.
 */
const serverEnvSchema = z.object({
  GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY is required for AI features'),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  GEMINI_EMBEDDING_MODEL: z.string().default('text-embedding-004'),
  GEMINI_MODEL_MAX_TOKENS: z.coerce.number().int().positive().default(4096),
  CRON_SECRET: z.string().min(16).optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  if (cached) return cached;

  const parsed = serverEnvSchema.safeParse({
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_MODEL: process.env.GEMINI_MODEL,
    GEMINI_EMBEDDING_MODEL: process.env.GEMINI_EMBEDDING_MODEL,
    GEMINI_MODEL_MAX_TOKENS: process.env.GEMINI_MODEL_MAX_TOKENS,
    CRON_SECRET: process.env.CRON_SECRET,
  });

  if (!parsed.success) {
    const missing = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Invalid or missing server environment variables: ${missing}`);
  }

  if (process.env.NODE_ENV === 'production' && !parsed.data.CRON_SECRET) {
    throw new Error('CRON_SECRET must be set in production (see src/app/api/keep-alive/route.ts).');
  }

  cached = parsed.data;
  return cached;
}
