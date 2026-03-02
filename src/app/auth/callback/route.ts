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
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  // Handle error params from Supabase (e.g. expired link)
  const errorDescription = searchParams.get('error_description');
  if (errorDescription) {
    const message = encodeURIComponent(errorDescription);
    return NextResponse.redirect(`${origin}/login?error=${message}`);
  }

  if (!code) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent('Invalid or missing authentication code. Please try again.')}`
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
      `${origin}/login?error=${encodeURIComponent(message)}`
    );
  }

  // Redirect to the intended destination
  // Ensure the `next` path is a relative path (prevent open redirect attacks)
  const safePath = next.startsWith('/') ? next : '/dashboard';
  return NextResponse.redirect(`${origin}${safePath}`);
}
