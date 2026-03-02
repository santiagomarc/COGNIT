import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// ── Protected path prefixes ──
const PROTECTED_PATHS = ['/dashboard'];
// ── Auth-only paths: redirect to dashboard if already logged in ──
const AUTH_ONLY_PATHS = ['/login'];
// ── Paths that require a session but aren't "dashboard" ──
const SESSION_REQUIRED_PATHS = ['/login/update-password'];

// Proxy runs BEFORE every request (renamed from middleware in Next.js 16)
// Purpose: Refresh auth tokens, protect routes, enforce redirects
export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: Do not run code between createServerClient and supabase.auth.getUser()
  // A simple mistake could make your app vulnerable to security issues.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // ── Protect dashboard routes ──
  if (!user && PROTECTED_PATHS.some((p) => pathname.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    // Preserve the intended destination so we can redirect back after login
    url.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(url);
  }

  // ── Protect update-password (requires active session from reset link) ──
  if (!user && SESSION_REQUIRED_PATHS.some((p) => pathname.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('error', 'Your reset link has expired. Please request a new one.');
    return NextResponse.redirect(url);
  }

  // ── Redirect logged-in users away from auth-only pages ──
  if (user && AUTH_ONLY_PATHS.some((p) => pathname === p)) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

// Configure which routes the middleware should run on
export const config = {
  matcher: [
    // Run on all routes except static files and api routes
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
