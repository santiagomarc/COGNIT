'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Sparkles, BookOpen, Brain, Layers } from 'lucide-react';
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

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'login' | 'signup'>('login');

  const router = useRouter();
  const supabase = createClient();
  const reduced = useReducedMotion();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        router.push('/dashboard');
        router.refresh();
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });

        if (error) throw error;

        // Phase 3: replaced setError hack with proper toast
        toast.success('Check your email for a confirmation link!');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }

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

        <motion.div
          initial={reduced ? undefined : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 26 }}
          className="w-full max-w-sm"
        >
          {/* Header */}
          <div className="mb-8 text-center lg:text-left">
            <h1 className="text-2xl font-bold tracking-tight">
              {mode === 'login' ? 'Welcome back' : 'Create account'}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {mode === 'login'
                ? 'Sign in to access your study decks'
                : 'Start your learning journey with Cognit'}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </div>

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading
                ? 'Loading...'
                : mode === 'login'
                  ? 'Sign In'
                  : 'Sign Up'}
            </Button>
          </form>

          {/* Mode toggle */}
          <p className="mt-6 text-center text-sm text-muted-foreground">
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'login' ? 'signup' : 'login');
                setError(null);
              }}
              className="font-medium text-primary transition-colors hover:underline"
            >
              {mode === 'login' ? 'Sign Up' : 'Sign In'}
            </button>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
