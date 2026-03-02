'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ThemeToggle } from '@/components/ThemeToggle';
import { PasswordStrength } from '@/components/ui/shared/PasswordStrength';
import { updatePassword } from '@/app/auth/actions';
import { updatePasswordSchema } from '@/lib/schemas';
import {
  Sparkles,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle2,
} from 'lucide-react';

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  const reduced = useReducedMotion();

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
      <div className="fixed right-4 top-4 z-50">
        <ThemeToggle />
      </div>

      <motion.div
        initial={reduced ? undefined : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 26 }}
        className="w-full max-w-sm"
      >
        {/* Logo */}
        <Link
          href="/"
          className="mx-auto mb-8 flex w-fit items-center gap-2.5"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/25 bg-primary/15">
            <Sparkles className="h-4.5 w-4.5 text-primary" />
          </div>
          <span className="text-xl font-bold tracking-tight">Cognit</span>
        </Link>

        {success ? (
          /* ── Success state ── */
          <div className="text-center space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-green-500/10 border border-green-500/20">
              <CheckCircle2 className="h-7 w-7 text-green-500" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">
              Password updated
            </h1>
            <p className="text-sm text-muted-foreground">
              Your password has been reset successfully.
            </p>
            <Button asChild className="mt-2">
              <Link href="/dashboard">Go to Dashboard</Link>
            </Button>
          </div>
        ) : (
          <>
            {/* ── Header ── */}
            <div className="mb-8 text-center">
              <h1 className="text-2xl font-bold tracking-tight">
                Set a new password
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Choose a strong password for your account
              </p>
            </div>

            {/* ── Form ── */}
            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              {/* New password */}
              <div className="space-y-2">
                <Label htmlFor="password">New Password</Label>
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
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                    tabIndex={-1}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
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
                <Label htmlFor="confirmPassword">Confirm Password</Label>
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
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
                  role="alert"
                >
                  {generalError}
                </motion.div>
              )}

              <Button type="submit" className="w-full" disabled={isPending}>
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  'Update Password'
                )}
              </Button>
            </form>
          </>
        )}
      </motion.div>
    </div>
  );
}
