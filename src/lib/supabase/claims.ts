import type { JwtPayload } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';

/** Just the one method this needs, so the proxy's and the render's clients both fit. */
type ClaimsClient = {
  auth: { getClaims(): Promise<{ data: { claims: JwtPayload } | null; error: unknown }> };
};

/**
 * `auth.getClaims()`, failing closed.
 *
 * auth-js returns an AuthError as `error` but RETHROWS anything else:
 * `decodeJWT` JSON-parses the cookie's payload (a SyntaxError on a tampered
 * or truncated cookie) and `validateExp` throws a plain `Error`. Unwrapped,
 * either becomes a 500 on every route the proxy matches. A token that cannot
 * be verified is a signed-out request.
 */
export async function verifiedClaims(supabase: ClaimsClient): Promise<JwtPayload | null> {
  try {
    const { data, error } = await supabase.auth.getClaims();
    return error || !data ? null : data.claims;
  } catch (error) {
    logger.warn('auth', 'getClaims threw; treating the request as signed out', {
      name: error instanceof Error ? error.name : typeof error,
    });
    return null;
  }
}
