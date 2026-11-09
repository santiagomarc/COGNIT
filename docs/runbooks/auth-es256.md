# Runbook — Move Supabase Auth to ES256 signing keys (AUTH-02)

**Status: open.** As of 2026-11-09 the project's JWKS is still empty (`{"keys":[]}`), so tokens
are HS256. This is a dashboard change with no code. Only the owner can do it.

**Why:** with an asymmetric key, `getClaims()` verifies the session locally against the cached
JWKS. That removes two serial Auth round trips from every signed-in navigation.

## Steps

1. Supabase Dashboard → Project Settings → JWT Keys → **Migrate JWT secret**. The legacy HS256
   secret becomes a *previously used* key, which is still trusted for verification.
2. **Create a standby key**: ECC P-256 (ES256).
3. **Rotate** the standby key to current. New sessions get ES256 tokens. Existing HS256 tokens
   stay valid until they expire (≤ 1 h).
4. **Verify:**
   `curl -s "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/.well-known/jwks.json"` lists a key with
   `"alg": "ES256"`.
5. **Measure** proxy and render time before and after in Vercel's function logs.
6. **Do not revoke the legacy secret** while the anon and service keys are legacy JWTs signed by
   it. Moving to Supabase's publishable/secret API keys is a separate change.

Afterwards, correct the comment in `src/app/dashboard/(shell)/layout.tsx` that describes the
check as local.

Optional follow-ups from the same review:
- **AUTH-03:** a forge-proof `email_confirmed` claim via a Custom Access Token hook.
- **AUTH-04:** replace `auth.getUser()` with `getSessionUser()` where only identity is needed.

The full text is in `git show archive/pre-docs-cleanup:COGNIT_NEXT_HORIZON_PLAN.md` §6.3.
