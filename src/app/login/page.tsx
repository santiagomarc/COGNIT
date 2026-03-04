import { Suspense } from 'react';
import LoginClient from './LoginClient';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Login - Cognit',
  description: 'Sign in to access your Cognit flashcards and study decks.',
};

export default function LoginPage() {
  return (
    <Suspense>
      <LoginClient />
    </Suspense>
  );
}
