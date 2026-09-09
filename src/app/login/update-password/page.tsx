'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { m, useReducedMotion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ThemeToggle } from '@/components/ThemeToggle';
import { PasswordStrength } from '@/components/ui/shared/PasswordStrength';
import { Wordmark } from '@/components/ui/shared/Wordmark';
import { updatePassword } from '@/app/auth/actions';
import { updatePasswordSchema } from '@/lib/schemas';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { motionTransitions } from '@/lib/motion-configs';
import { useHasMounted } from '@/components/motion';

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Resting state on the server and on the first client render — see LoginClient.
  const hasMounted = useHasMounted();
  const prefersReduced = useReducedMotion();
  const reduced = !hasMounted || prefersReduced;

  function clearFieldError(field: string) {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
    setGeneralError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    setGeneralError(null);

    const parsed = updatePasswordSchema.safeParse({ password, confirmPassword });
    if (!parsed.success) {
      setFieldErrors(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      return;
    }

    startTransition(async () => {
      const result = await updatePassword({ password, confirmPassword });
      if (result?.error) {
        if (typeof result.error === 'string') {
          setGeneralError(result.error);
        } else {
          setFieldErrors(result.error as Record<string, string[]>);
        }
      } else {
        setSuccess(true);
      }
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      {/* Theme toggle */}
      <div className="fixed right-4 top-4 z-[var(--z-sticky)]">
        <ThemeToggle />
      </div>

      <m.div
        initial={reduced ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduced ? { duration: 0 } : motionTransitions.panel}
        className="panel w-full max-w-[420px] p-8"
      >
        <div className="mb-8">
          <Wordmark href="/" />
        </div>

        {success ? (
          /* ── Success state ── */
          <div className="space-y-4">
            <p
              className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em]"
              style={{ color: 'var(--state-mastered)' }}
            >
              Password updated
            </p>
            <h1 className="font-serif text-[2rem] font-normal leading-tight tracking-[-0.015em] text-balance">
              You&apos;re signed in
            </h1>
            <p className="text-sm text-ink-dim">
              Your new password is active. Use it the next time you sign in.
            </p>
            <Button asChild variant="primary" className="mt-2">
              <Link href="/dashboard">Go to dashboard</Link>
            </Button>
          </div>
        ) : (
          <>
            {/* ── Header ── */}
            <div className="mb-8">
              <h1 className="font-serif text-[2rem] font-normal leading-tight tracking-[-0.015em] text-balance">
                Set a new password
              </h1>
              <p className="mt-1.5 text-sm text-ink-dim">
                At least 8 characters, with a number and both letter cases.
              </p>
            </div>

            {/* ── Form ── */}
            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              {/* New password */}
              <div className="space-y-2">
                <Label htmlFor="password">New password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Create a strong password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      clearFieldError('password');
                    }}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    aria-invalid={!!fieldErrors.password}
                    aria-describedby={
                      fieldErrors.password ? 'pw-error' : 'pw-strength'
                    }
                    disabled={isPending}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-1/2 flex size-[26px] -translate-y-1/2 items-center justify-center rounded-[var(--radius-sm)] text-muted-foreground outline-hidden transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                    aria-pressed={showPassword}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
                {fieldErrors.password && (
                  <p id="pw-error" className="text-xs text-destructive" role="alert">
                    {fieldErrors.password[0]}
                  </p>
                )}
                <div id="pw-strength">
                  <PasswordStrength password={password} />
                </div>
              </div>

              {/* Confirm password */}
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm password</Label>
                <Input
                  id="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    clearFieldError('confirmPassword');
                  }}
                  required
                  autoComplete="new-password"
                  aria-invalid={!!fieldErrors.confirmPassword}
                  aria-describedby={
                    fieldErrors.confirmPassword ? 'confirm-error' : undefined
                  }
                  disabled={isPending}
                />
                {fieldErrors.confirmPassword && (
                  <p
                    id="confirm-error"
                    className="text-xs text-destructive"
                    role="alert"
                  >
                    {fieldErrors.confirmPassword[0]}
                  </p>
                )}
              </div>

              {/* General error */}
              {generalError && (
                <p
                  className="rounded-[var(--radius-md)] border border-[var(--state-lapsed)] px-3 py-2.5 text-sm"
                  style={{ color: 'var(--state-lapsed)' }}
                  role="alert"
                >
                  {generalError}
                </p>
              )}

              <Button type="submit" variant="primary" className="w-full" disabled={isPending}>
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Updating…
                  </>
                ) : (
                  'Update password'
                )}
              </Button>
            </form>
          </>
        )}
      </m.div>
    </div>
  );
}
