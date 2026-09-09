'use client';

import { useEffect, useState, useTransition } from 'react';
import { useSearchParams } from 'next/navigation';
import { m, useReducedMotion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ThemeToggle } from '@/components/ThemeToggle';
import { PasswordStrength } from '@/components/ui/shared/PasswordStrength';
import { Wordmark } from '@/components/ui/shared/Wordmark';
import { login, signup, resetPassword, loginWithOAuth } from '@/app/auth/actions';
import { loginSchema, signupSchema, resetPasswordSchema } from '@/lib/schemas';
import { motionTransitions } from '@/lib/motion-configs';
import { useHasMounted } from '@/components/motion';
import { Eye, EyeOff, Loader2, ArrowLeft, Github } from 'lucide-react';

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.57-5.17 3.57-8.82Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.88-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.26v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.27 14.28A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.56.38-2.28v-3.1H1.26A12 12 0 0 0 0 12c0 1.94.46 3.77 1.26 5.38l4.01-3.1Z" />
      <path fill="#EA4335" d="M12 4.76c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.26 6.62l4.01 3.1c.95-2.85 3.6-4.96 6.73-4.96Z" />
    </svg>
  );
}
import { toast } from 'sonner';

/*
 * The left panel's illustration. It used to be three cards bobbing on an
 * infinite loop, each with a tinted icon box — two of them `<BookOpen/>` and
 * `<Brain/>`. What a prospective user actually needs to see is what the product
 * *is*: a prompt, and the interval the scheduler assigns once you answer it.
 *
 * So the illustration is now a specimen of the real deck row (§7.5) — a state
 * tick, a prompt, and a mono interval — which is both honest and free.
 */
const SPECIMEN_CARDS = [
  { prompt: 'What is a closure?', interval: '4d', state: 'var(--state-mastered)' },
  { prompt: 'Explain Big-O notation', interval: '11h', state: 'var(--state-learning)' },
  { prompt: 'Define polymorphism', interval: 'due', state: 'var(--state-due)' },
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
  /*
   * `useReducedMotion()` cannot know the preference during SSR, so branching a
   * render-time prop on it alone ships the animated markup from the server and
   * mismatches for a reduced-motion client. Gating on `useHasMounted` makes the
   * server and the first client render the same resting state for everyone.
   */
  const hasMounted = useHasMounted();
  const prefersReduced = useReducedMotion();
  const reduced = !hasMounted || prefersReduced;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<AuthMode>(() => resolveMode(searchParams.get('mode')));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [oauthProvider, setOauthProvider] = useState<'google' | 'github' | null>(null);

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

  async function handleOAuthClick(provider: 'google' | 'github') {
    setGeneralError(null);
    setOauthProvider(provider);
    const redirectTo = searchParams.get('redirectTo');
    const result = await loginWithOAuth(provider, redirectTo);
    // On success loginWithOAuth redirects and this line is never reached.
    setOauthProvider(null);
    if (result?.error) {
      setGeneralError(result.error);
    }
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
      <div className="relative hidden w-[55%] flex-col justify-center border-r border-border px-12 lg:flex">
        <div className="mx-auto w-full max-w-md">
          <Wordmark href="/" size="lg" />

          <p className="mt-4 max-w-sm text-lg leading-relaxed text-muted-foreground">
            The universal active recall engine.{' '}
            <span className="text-ink">Study smarter, remember forever.</span>
          </p>

          {/* A specimen of the real deck row (§7.5), not an illustration of one. */}
          <div className="mt-10 border-t border-border">
            {SPECIMEN_CARDS.map((card) => (
              <div
                key={card.prompt}
                className="flex items-center gap-3 border-b border-border py-3"
              >
                <span
                  aria-hidden="true"
                  className="h-4 w-[2px] shrink-0 rounded-[1px]"
                  style={{ backgroundColor: card.state }}
                />
                <span className="min-w-0 flex-1 truncate text-sm text-ink-dim">
                  {card.prompt}
                </span>
                <span
                  className="font-mono text-[13px] tnum"
                  style={{ color: card.state }}
                >
                  {card.interval}
                </span>
              </div>
            ))}
          </div>

          <p className="mt-4 font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
            Next review, scheduled by SM-2
          </p>
        </div>
      </div>

      {/* ═══════════ Right panel (auth form) ═══════════ */}
      <div className="relative flex flex-1 flex-col items-center justify-center px-6 py-12">
        {/* Theme toggle */}
        <div className="absolute right-4 top-4">
          <ThemeToggle />
        </div>

        {/* Mobile-only mark */}
        <div className="mb-8 lg:hidden">
          <Wordmark href="/" />
        </div>

        <AnimatePresence mode="wait">
          <m.div
            key={emailSent ? 'sent' : mode}
            initial={reduced ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={reduced ? { duration: 0 } : motionTransitions.panel}
            className="panel w-full max-w-[420px] p-8"
          >
            {/* ── Email sent confirmation ── */}
            {emailSent ? (
              <div className="space-y-4">
                <p className="font-mono text-[10px] uppercase leading-[1.5] tracking-[0.16em] text-ink-dimmer">
                  Check your email
                </p>
                <h1 className="font-serif text-[2rem] font-normal leading-tight tracking-[-0.015em] text-balance">
                  {mode === 'signup' ? 'Confirm your address' : 'Reset link sent'}
                </h1>
                <p className="text-sm leading-relaxed text-ink-dim">
                  {mode === 'signup'
                    ? 'We sent a confirmation link to '
                    : 'If an account exists, we sent a reset link to '}
                  <span className="font-mono text-ink">{email}</span>. Open it to
                  {mode === 'signup' ? ' finish signing up.' : ' choose a new password.'}
                </p>
                <p className="text-xs text-muted-foreground">
                  Nothing after a minute? Check your spam folder, then{' '}
                  <button
                    type="button"
                    onClick={() => setEmailSent(false)}
                    className="rounded-[var(--radius-sm)] font-medium text-ink underline underline-offset-4 outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                  >
                    send it again
                  </button>
                  .
                </p>
                <Button onClick={() => switchMode('login')} className="mt-2 gap-2">
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  Back to sign in
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
                      className="mb-3 inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] text-sm text-muted-foreground outline-hidden transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                      Back to sign in
                    </button>
                  )}
                  <h1 className="font-serif text-[2rem] font-normal leading-tight tracking-[-0.015em] text-balance">
                    {headings[mode].title}
                  </h1>
                  <p className="mt-1.5 text-sm text-ink-dim">
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
                            className="rounded-[var(--radius-sm)] text-xs font-medium text-ink-dim underline-offset-4 transition-colors outline-hidden hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
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
                    <p
                      className="rounded-[var(--radius-md)] border border-[var(--state-lapsed)] px-3 py-2.5 text-sm"
                      style={{ color: 'var(--state-lapsed)' }}
                      role="alert"
                    >
                      {generalError}
                    </p>
                  )}

                  {/* Submit button */}
                  <Button type="submit" variant="primary" className="w-full" disabled={isPending}>
                    {isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        {mode === 'login'
                          ? 'Signing in…'
                          : mode === 'signup'
                            ? 'Creating account…'
                            : 'Sending link…'}
                      </>
                    ) : mode === 'login' ? (
                      'Sign in'
                    ) : mode === 'signup' ? (
                      'Create account'
                    ) : (
                      'Send reset link'
                    )}
                  </Button>
                </form>

                {/* OAuth providers (login / signup only) */}
                {mode !== 'forgot' && (
                  <div className="mt-6">
                    <div className="relative flex items-center">
                      <div className="h-px flex-1 bg-border" />
                      <span className="px-3 text-xs text-muted-foreground">or continue with</span>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <Button
                        type="button"
                        onClick={() => handleOAuthClick('google')}
                        disabled={oauthProvider !== null || isPending}
                      >
                        {oauthProvider === 'google' ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon />}
                        Google
                      </Button>
                      <Button
                        type="button"
                        onClick={() => handleOAuthClick('github')}
                        disabled={oauthProvider !== null || isPending}
                      >
                        {oauthProvider === 'github' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Github className="h-4 w-4" />}
                        GitHub
                      </Button>
                    </div>
                  </div>
                )}

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
                      className="rounded-[var(--radius-sm)] font-medium text-ink underline underline-offset-4 outline-hidden transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                    >
                      {mode === 'login' ? 'Sign up' : 'Sign in'}
                    </button>
                  </p>
                )}
              </>
            )}
          </m.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
