import { describe, expect, it } from 'vitest';
import type { JwtPayload } from '@supabase/supabase-js';
import { verifiedClaims } from '@/lib/supabase/claims';

const CLAIMS = { sub: 'user-1', email: 'a@b.c' } as JwtPayload;

describe('verifiedClaims (AUTH-01)', () => {
  it('returns the claims when getClaims succeeds', async () => {
    await expect(verifiedClaims({ auth: { getClaims: async () => ({ data: { claims: CLAIMS }, error: null }) } })).resolves.toBe(CLAIMS);
  });

  it('returns null when getClaims reports an AuthError', async () => {
    await expect(verifiedClaims({ auth: { getClaims: async () => ({ data: null, error: new Error('invalid JWT') }) } })).resolves.toBeNull();
  });

  it('fails closed when getClaims throws — a tampered cookie payload or an expired token', async () => {
    await expect(verifiedClaims({ auth: { getClaims: async () => { throw new SyntaxError('Unexpected token'); } } })).resolves.toBeNull();
    await expect(verifiedClaims({ auth: { getClaims: async () => { throw new Error('JWT has expired'); } } })).resolves.toBeNull();
  });
});
