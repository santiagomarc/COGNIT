import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// This route handles ALL Supabase auth redirects:
// 1. Email confirmation after signup
// 2. Password reset link clicks
// 3. Magic link logins (future)
//
// Supabase sends users here with a "code" in the URL.
// We exchange the code for a session, then redirect.
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = requestUrl.searchParams.get('next') ?? '/dashboard';

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '');
  const baseOrigin = siteUrl || requestUrl.origin;

  // Handle error params from Supabase (e.g. expired link)
  const errorDescription = requestUrl.searchParams.get('error_description');
  if (errorDescription) {
    const message = encodeURIComponent(errorDescription);
    return NextResponse.redirect(`${baseOrigin}/login?error=${message}`);
  }

  if (!code) {
    return NextResponse.redirect(
      `${baseOrigin}/login?error=${encodeURIComponent('Invalid or missing authentication code. Please try again.')}`
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // Map common exchange errors to user-friendly messages
    let message = 'Authentication failed. Please try again.';
    const msg = error.message.toLowerCase();
    if (msg.includes('expired') || msg.includes('invalid')) {
      message = 'This link has expired. Please request a new one.';
    } else if (msg.includes('already') || msg.includes('used')) {
      message = 'This link has already been used. Please sign in.';
    }
    return NextResponse.redirect(
      `${baseOrigin}/login?error=${encodeURIComponent(message)}`
    );
  }

  // Redirect to the intended destination
  // Ensure the `next` path is a relative path starting with single / (prevent open redirect attacks)
  const isSafe = next.startsWith('/') && !next.startsWith('//') && !next.includes('\\');
  const safePath = isSafe ? next : '/dashboard';
  return NextResponse.redirect(new URL(safePath, baseOrigin));
}
