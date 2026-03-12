'use client';

import { useEffect, useState, useTransition } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion, useReducedMotion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ThemeToggle } from '@/components/ThemeToggle';
import { PasswordStrength } from '@/components/ui/shared/PasswordStrength';
import { login, signup, resetPassword } from '@/app/auth/actions';
import { loginSchema, signupSchema, resetPasswordSchema } from '@/lib/schemas';
import {
  Sparkles,
  BookOpen,
  Brain,
  Layers,
  Eye,
  EyeOff,
  Loader2,
  ArrowLeft,
  Mail,
} from 'lucide-react';
import { toast } from 'sonner';

/* ── Floating flashcard illustration props ── */
const floatingCards = [
  {
    rotation: -6,
    x: '12%',
    y: '22%',
    delay: 0,
    icon: BookOpen,
    label: 'What is a closure?',
  },
  {
    rotation: 4,
    x: '58%',
    y: '36%',
    delay: 0.8,
    icon: Brain,
    label: 'Explain Big-O notation',
  },
  {
    rotation: -3,
    x: '28%',
    y: '62%',
    delay: 1.6,
    icon: Layers,
    label: 'Define polymorphism',
  },
];

type AuthMode = 'login' | 'signup' | 'forgot';

function resolveMode(value: string | null): AuthMode {
  if (value === 'signup' || value === 'forgot') {
    return value;
  }

  return 'login';
}

export default function LoginClient() {
  const searchParams = useSearchParams();
  const reduced = useReducedMotion();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<AuthMode>(() => resolveMode(searchParams.get('mode')));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setGeneralError(searchParams.get('error'));
  }, [searchParams]);

  useEffect(() => {
    if (emailSent) {
      return;
    }

    setMode(resolveMode(searchParams.get('mode')));
  }, [emailSent, searchParams]);

  // Clear errors when switching modes
  function switchMode(newMode: AuthMode) {
    setMode(newMode);
    setFieldErrors({});
    setGeneralError(null);
    setEmailSent(false);
    setShowPassword(false);
  }

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

    if (mode === 'forgot') {
      // ── Forgot Password ──
      const parsed = resetPasswordSchema.safeParse({ email });
      if (!parsed.success) {
        setFieldErrors(parsed.error.flatten().fieldErrors as Record<string, string[]>);
        return;
      }

      startTransition(async () => {
        const result = await resetPassword({ email });
        if (result?.error) {
          if (typeof result.error === 'string') {
            setGeneralError(result.error);
          } else {
            setFieldErrors(result.error as Record<string, string[]>);
          }
        } else {
          setEmailSent(true);
          toast.success(result.message ?? 'Reset email sent!');
        }
      });
      return;
    }

    if (mode === 'login') {
      // ── Login ──
      const parsed = loginSchema.safeParse({ email, password });
      if (!parsed.success) {
        setFieldErrors(parsed.error.flatten().fieldErrors as Record<string, string[]>);
        return;
      }

      startTransition(async () => {
        const redirectTo = searchParams.get('redirectTo') || '/dashboard';
        const result = await login({ email, password, redirectTo });
        // If login succeeds, the server action redirects — we only reach here on error
        if (result?.error) {
          if (typeof result.error === 'string') {
            setGeneralError(result.error);
          } else {
            setFieldErrors(result.error as Record<string, string[]>);
          }
        }
      });
    } else {
      // ── Signup ──
      const parsed = signupSchema.safeParse({ email, password });
      if (!parsed.success) {
        setFieldErrors(parsed.error.flatten().fieldErrors as Record<string, string[]>);
        return;
      }

      startTransition(async () => {
        const result = await signup({ email, password });
        if (result?.error) {
          if (typeof result.error === 'string') {
            setGeneralError(result.error);
          } else {
            setFieldErrors(result.error as Record<string, string[]>);
          }
        } else {
          setEmailSent(true);
          toast.success(result.message ?? 'Check your email!');
        }
      });
    }
  }

  // ── Titles & descriptions per mode ──
  const headings: Record<AuthMode, { title: string; desc: string }> = {
    login: {
      title: 'Welcome back',
      desc: 'Sign in to access your study decks',
    },
    signup: {
      title: 'Create account',
      desc: 'Start your learning journey with Cognit',
    },
    forgot: {
      title: 'Reset password',
      desc: "Enter your email and we'll send a reset link",
    },
  };

  return (
    <div className="flex min-h-screen">
      {/* ═══════════ Left panel (branding) ═══════════ */}
      <div className="relative hidden w-[60%] overflow-hidden bg-gradient-to-br from-background via-primary/5 to-background lg:flex">
        {/* Gradient orbs */}
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute -left-24 -top-24 h-[420px] w-[420px] rounded-full bg-primary/8 blur-3xl" />
          <div className="absolute -bottom-32 -right-32 h-[360px] w-[360px] rounded-full bg-neon/8 blur-3xl" />
        </div>

        {/* Center content */}
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-12">
          {/* Logo */}
          <Link href="/" className="mb-6 inline-flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/25 bg-primary/15">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <span className="glow-title text-3xl font-extrabold tracking-tighter bg-gradient-to-br from-primary via-neon to-primary/60 bg-clip-text text-transparent">
              Cognit
            </span>
          </Link>

          <p className="max-w-sm text-center text-lg leading-relaxed text-muted-foreground">
            The universal active recall engine.
            <br />
            <span className="text-foreground/80 font-medium">
              Study smarter, remember forever.
            </span>
          </p>

          {/* Floating flashcard illustrations */}
          <div className="relative mt-12 h-72 w-full max-w-md">
            {floatingCards.map((card) => {
              const Icon = card.icon;
              return (
                <motion.div
                  key={card.label}
                  className="absolute glass-card rounded-xl border border-primary/15 px-5 py-4 shadow-lg"
                  style={{
                    left: card.x,
                    top: card.y,
                    rotate: card.rotation,
                  }}
                  animate={
                    reduced
                      ? undefined
                      : {
                          y: [0, -10, 0],
                        }
                  }
                  transition={{
                    duration: 4,
                    repeat: Infinity,
                    ease: 'easeInOut',
                    delay: card.delay,
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <span className="text-sm font-medium whitespace-nowrap">
                      {card.label}
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Subtle border on the right edge */}
        <div className="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-primary/15 to-transparent" />
      </div>

      {/* ═══════════ Right panel (auth form) ═══════════ */}
      <div className="relative flex flex-1 flex-col items-center justify-center px-6 py-12">
        {/* Theme toggle */}
        <div className="absolute right-4 top-4">
          <ThemeToggle />
        </div>

        {/* Mobile-only logo */}
        <Link href="/" className="mb-8 inline-flex items-center gap-2.5 lg:hidden">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/25 bg-primary/15">
            <Sparkles className="h-4.5 w-4.5 text-primary" />
          </div>
          <span className="text-xl font-bold tracking-tight">Cognit</span>
        </Link>

        <AnimatePresence mode="wait">
          <motion.div
            key={emailSent ? 'sent' : mode}
            initial={reduced ? undefined : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? undefined : { opacity: 0, y: -12 }}
            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
            className="w-full max-w-sm"
          >
            {/* ── Email sent confirmation ── */}
            {emailSent ? (
              <div className="text-center space-y-4">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20">
                  <Mail className="h-7 w-7 text-primary" />
                </div>
                <h1 className="text-2xl font-bold tracking-tight">Check your email</h1>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {mode === 'signup'
                    ? "We've sent a confirmation link to "
                    : "If an account exists, we've sent a reset link to "}
                  <span className="font-medium text-foreground">{email}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Didn&apos;t get it? Check your spam folder or{' '}
                  <button
                    type="button"
                    onClick={() => setEmailSent(false)}
                    className="font-medium text-primary hover:underline"
                  >
                    try again
                  </button>
                </p>
                <Button
                  variant="outline"
                  onClick={() => switchMode('login')}
                  className="mt-2 gap-2"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to Sign In
                </Button>
              </div>
            ) : (
              <>
                {/* ── Header ── */}
                <div className="mb-8 text-center lg:text-left">
                  {mode === 'forgot' && (
                    <button
                      type="button"
                      onClick={() => switchMode('login')}
                      className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      Back to Sign In
                    </button>
                  )}
                  <h1 className="text-2xl font-bold tracking-tight">
                    {headings[mode].title}
                  </h1>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    {headings[mode].desc}
                  </p>
                </div>

                {/* ── Form ── */}
                <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                  {/* Email */}
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        clearFieldError('email');
                      }}
                      required
                      autoComplete="email"
                      aria-invalid={!!fieldErrors.email}
                      aria-describedby={fieldErrors.email ? 'email-error' : undefined}
                      disabled={isPending}
                    />
                    {fieldErrors.email && (
                      <p id="email-error" className="text-xs text-destructive" role="alert">
                        {fieldErrors.email[0]}
                      </p>
                    )}
                  </div>

                  {/* Password (hidden in forgot mode) */}
                  {mode !== 'forgot' && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="password">Password</Label>
                        {mode === 'login' && (
                          <button
                            type="button"
                            onClick={() => switchMode('forgot')}
                            className="text-xs font-medium text-primary transition-colors hover:underline"
                            tabIndex={-1}
                          >
                            Forgot password?
                          </button>
                        )}
                      </div>
                      <div className="relative">
                        <Input
                          id="password"
                          type={showPassword ? 'text' : 'password'}
                          placeholder={mode === 'signup' ? 'Create a strong password' : '••••••••'}
                          value={password}
                          onChange={(e) => {
                            setPassword(e.target.value);
                            clearFieldError('password');
                          }}
                          required
                          minLength={mode === 'signup' ? 8 : 1}
                          autoComplete={
                            mode === 'login' ? 'current-password' : 'new-password'
                          }
                          aria-invalid={!!fieldErrors.password}
                          aria-describedby={
                            fieldErrors.password
                              ? 'password-error'
                              : mode === 'signup'
                                ? 'password-strength'
                                : undefined
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
                        <p id="password-error" className="text-xs text-destructive" role="alert">
                          {fieldErrors.password[0]}
                        </p>
                      )}
                      {/* Password strength meter (signup only) */}
                      {mode === 'signup' && (
                        <div id="password-strength">
                          <PasswordStrength password={password} />
                        </div>
                      )}
                    </div>
                  )}

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

                  {/* Submit button */}
                  <Button type="submit" className="w-full" disabled={isPending}>
                    {isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {mode === 'login'
                          ? 'Signing in...'
                          : mode === 'signup'
                            ? 'Creating account...'
                            : 'Sending link...'}
                      </>
                    ) : mode === 'login' ? (
                      'Sign In'
                    ) : mode === 'signup' ? (
                      'Create Account'
                    ) : (
                      'Send Reset Link'
                    )}
                  </Button>
                </form>

                {/* Mode toggle */}
                {mode !== 'forgot' && (
                  <p className="mt-6 text-center text-sm text-muted-foreground">
                    {mode === 'login'
                      ? "Don't have an account? "
                      : 'Already have an account? '}
                    <button
                      type="button"
                      onClick={() =>
                        switchMode(mode === 'login' ? 'signup' : 'login')
                      }
                      className="font-medium text-primary transition-colors hover:underline"
                    >
                      {mode === 'login' ? 'Sign Up' : 'Sign In'}
                    </button>
                  </p>
                )}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
