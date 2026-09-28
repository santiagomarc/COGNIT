import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/lib/database.types';
import { publicEnv } from '@/lib/env-public';
import { verifiedClaims } from '@/lib/supabase/claims';
import { CSP_ENFORCE, newNonce, strictCspHeaders, wantsNonce } from '@/lib/csp';

// ── Protected path prefixes ──
const PROTECTED_PATHS = ['/dashboard'];
// ── Paths that require a session but aren't "dashboard" ──
const SESSION_REQUIRED_PATHS = ['/login/update-password'];

const SUPABASE_ORIGIN = new URL(publicEnv.NEXT_PUBLIC_SUPABASE_URL).origin;
const DEV = process.env.NODE_ENV !== 'production';

// Proxy runs BEFORE every request (renamed from middleware in Next.js 16)
// Purpose: Refresh auth tokens, protect routes, enforce redirects
export async function proxy(request: NextRequest) {
  const csp = wantsNonce(request.nextUrl.pathname)
    ? strictCspHeaders({ nonce: newNonce(), supabaseOrigin: SUPABASE_ORIGIN, dev: DEV, enforce: CSP_ENFORCE })
    : null;

  // Next reads the nonce from the REQUEST's CSP header and stamps it on its
  // own scripts; the browser enforces the RESPONSE header (plan §6.2).
  // Rebuilt after a cookie refresh so Server Components see the refreshed
  // cookies as well.
  const forward = () => {
    const headers = new Headers(request.headers);
    if (csp) {
      headers.set('content-security-policy', csp.request);
      headers.set('x-cognit-nonce', '1');
    }
    const response = NextResponse.next({ request: { headers } });
    if (csp) response.headers.set(csp.responseName, csp.response);
    // TEMPORARY probe variant: an enforcing response CSP whose nonce differs
    // from the request's, to see which one the render receives.
    if (request.nextUrl.pathname === '/s/csp-probe/enf') {
      response.headers.set('Content-Security-Policy', "script-src 'self' 'nonce-RESPONSECOPY'");
    }
    return response;
  };

  let supabaseResponse = forward();

  const supabase = createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = forward();
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: Do not run code between createServerClient and supabase.auth.getClaims()
  // A simple mistake could make your app vulnerable to security issues.
  //
  // `getClaims()` verifies the token's signature locally against the project's
  // cached public signing keys and refreshes an expired session exactly as
  // `getUser()` did — minus the Auth-server round-trip that used to sit in
  // front of every page. While the project still signs with the legacy HS256
  // secret it falls back to `getUser()` on its own (see `getSessionUser`).
  const claims = await verifiedClaims(supabase);

  const pathname = request.nextUrl.pathname;
  const isProtectedPath = PROTECTED_PATHS.some((p) => pathname.startsWith(p));

  // ── Protect dashboard routes ──
  if (!claims && isProtectedPath) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    // Preserve the intended destination so we can redirect back after login
    url.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(url);
  }

  // ── Enforce verified-email access for protected routes ──
  if (claims && isProtectedPath) {
    /*
     * Supabase Auth never opens a session on an unconfirmed address — password
     * sign-in is refused until the link is clicked, an OAuth identity with an
     * unverified email is refused too — and `login()` re-checks
     * `email_confirmed_at` on top. This gate is the backstop behind those, so
     * it reads the `email_verified` flag Auth writes into the token's
     * `user_metadata` on confirmation instead of paying a round-trip per
     * request to re-derive it. An account made through a path that never set
     * the flag (anonymous, admin-created) is still asked the slow, authoritative way.
     */
    const flag = claims.user_metadata?.email_verified;
    const isEmailVerified =
      typeof flag === 'boolean'
        ? flag
        : Boolean((await supabase.auth.getUser()).data.user?.email_confirmed_at);

    if (!isEmailVerified) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('redirectTo', pathname);
      url.searchParams.set('error', 'Please confirm your email before accessing the dashboard.');
      return NextResponse.redirect(url);
    }
  }

  // ── Protect update-password (requires active session from reset link) ──
  if (!claims && SESSION_REQUIRED_PATHS.some((p) => pathname.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('error', 'Your reset link has expired. Please request a new one.');
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

// Configure which routes the middleware should run on
export const config = {
  matcher: [
    // Run on all routes except static files and api routes
    '/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
