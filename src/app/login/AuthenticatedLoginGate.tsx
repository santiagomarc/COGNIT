'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Sparkles, ArrowRight, LogOut, Home, ShieldCheck } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/button';
import { logout } from '@/app/auth/actions';

type AuthenticatedLoginGateProps = {
  email: string;
};

function resolveRedirectTarget(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return '/dashboard';
  }

  return value === '/login' ? '/dashboard' : value;
}

export default function AuthenticatedLoginGate({ email }: AuthenticatedLoginGateProps) {
  const searchParams = useSearchParams();
  const redirectTarget = resolveRedirectTarget(searchParams.get('redirectTo'));
  const continueLabel = redirectTarget === '/dashboard' ? 'Go to Dashboard' : 'Continue';

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="fixed right-4 top-4 z-50">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md rounded-3xl border border-primary/15 bg-card/70 p-8 shadow-2xl backdrop-blur-xl">
        <Link href="/" className="mx-auto mb-8 flex w-fit items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/25 bg-primary/15">
            <Sparkles className="h-4.5 w-4.5 text-primary" />
          </div>
          <span className="text-xl font-bold tracking-tight">Cognit</span>
        </Link>

        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
          <ShieldCheck className="h-7 w-7 text-primary" />
        </div>

        <h1 className="text-2xl font-bold tracking-tight">You&apos;re already signed in</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          This browser already has an active Cognit session for
          {' '}
          <span className="font-medium text-foreground">{email}</span>.
        </p>

        <div className="mt-8 space-y-3">
          <Button asChild className="w-full justify-center">
            <Link href={redirectTarget}>
              {continueLabel}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>

          <form action={logout}>
            <Button type="submit" variant="outline" className="w-full justify-center">
              <LogOut className="h-4 w-4" />
              Use a Different Account
            </Button>
          </form>

          <Button asChild variant="ghost" className="w-full justify-center">
            <Link href="/">
              <Home className="h-4 w-4" />
              Back to Home
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}