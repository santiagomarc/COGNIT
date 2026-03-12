import { Suspense } from 'react';
import LoginClient from './LoginClient';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import AuthenticatedLoginGate from './AuthenticatedLoginGate';

export const metadata: Metadata = {
  title: 'Account - Cognit',
  description: 'Sign in, create an account, or manage your active Cognit session.',
};

export default async function LoginPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <Suspense>
      {user ? <AuthenticatedLoginGate email={user.email ?? 'your account'} /> : <LoginClient />}
    </Suspense>
  );
}
