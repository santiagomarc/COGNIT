import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// This route handles the redirect after a user clicks the email confirmation link
// Supabase sends them here with a "code" in the URL
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (code) {
    const supabase = await createClient();
    
    // Exchange the code for a session
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (!error) {
      // Success! Redirect to dashboard (or wherever 'next' points)
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // If something went wrong, redirect to login with an error
  return NextResponse.redirect(`${origin}/login?error=Could not authenticate`);
}
