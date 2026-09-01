import { z } from 'zod';
import { publicEnv } from '@/lib/env-public';

// Server-only environment. Never import this from client components —
// GEMINI_API_KEY and CRON_SECRET are not defined in the browser.
const serverEnvSchema = z.object({
  GEMINI_API_KEY: z.string().min(1),
  GEMINI_MODEL: z.string().min(1).optional(),
  GEMINI_MODEL_MAX_TOKENS: z.string().min(1).optional(),
  GEMINI_EMBEDDING_MODEL: z.string().min(1).optional(),
  CRON_SECRET: z.string().min(1).optional(),
});

function loadServerEnv() {
  const parsed = serverEnvSchema.safeParse(process.env);

  if (!parsed.success) {
    const missing = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Invalid or missing environment variables: ${missing}`);
  }

  return parsed.data;
}

// Validated once at module load so a misconfigured deploy fails fast and
// names the missing variable, instead of throwing deep inside the Supabase
// or Gemini SDKs the first time a request touches them.
export const env = {
  ...publicEnv,
  ...loadServerEnv(),
};
