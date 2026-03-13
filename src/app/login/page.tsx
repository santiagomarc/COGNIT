import { Suspense } from 'react';
import LoginClient from './LoginClient';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Login - Cognit',
  description: 'Sign in or create an account to access your Cognit dashboard.',
};

export default function LoginPage() {
  return (
    <Suspense>
      <LoginClient />
    </Suspense>
  );
}
