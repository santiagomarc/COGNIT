'use client';

import Link from 'next/link';
import { motion, useScroll, useTransform, useReducedMotion } from 'framer-motion';
import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Sparkles, ArrowRight, Layers, BarChart3, Brain } from 'lucide-react';

export function HeroSection() {
  const reduced = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end start'],
  });

  const mockupY = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const mockupRotate = useTransform(scrollYProgress, [0, 1], [2, -4]);
  const mockupScale = useTransform(scrollYProgress, [0, 0.5], [1, 0.95]);

  return (
    <section ref={containerRef} className="relative min-h-screen overflow-hidden">
      {/* ── Navbar ── */}
      <nav className="relative z-30 mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 border border-primary/25">
            <Sparkles className="h-4.5 w-4.5 text-primary" />
          </div>
          <span className="text-lg font-bold tracking-tight">Cognit</span>
        </Link>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link href="/login?mode=login">
            <Button variant="ghost" size="sm">Sign In</Button>
          </Link>
          <Link href="/login?mode=signup">
            <Button size="sm" className="hidden sm:inline-flex">
              Sign Up
              <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </nav>

      {/* ── Hero content ── */}
      <div className="relative z-20 mx-auto max-w-6xl px-6 pt-16 pb-8 md:pt-24">
        <div className="mx-auto max-w-3xl text-center">
          {/* Badge */}
          <motion.div
            initial={reduced ? undefined : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-medium text-primary backdrop-blur-sm"
          >
            <Sparkles className="h-3.5 w-3.5" />
            AI-Powered Active Recall
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={reduced ? undefined : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="glow-title text-5xl font-extrabold leading-[1.1] tracking-tighter sm:text-6xl lg:text-7xl"
          >
            <span className="bg-gradient-to-br from-foreground via-foreground/90 to-foreground/60 bg-clip-text text-transparent">
              Study smarter,
            </span>
            <br />
            <span className="bg-gradient-to-r from-primary via-neon to-primary/60 bg-clip-text text-transparent">
              remember forever
            </span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={reduced ? undefined : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground sm:text-xl"
          >
            Transform any document into interactive flashcards. Let AI do the heavy
            lifting while spaced repetition ensures you never forget.
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={reduced ? undefined : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.35 }}
            className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4"
          >
            <Link href="/login?mode=signup">
              <Button size="lg" className="w-full px-8 text-base sm:w-auto">
                Sign Up
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/login?mode=login">
              <Button variant="outline" size="lg" className="w-full px-8 text-base sm:w-auto">
                Sign In
              </Button>
            </Link>
          </motion.div>
        </div>

        {/* ── Glass browser mockup ── */}
        <motion.div
          style={reduced ? undefined : { y: mockupY, rotateX: mockupRotate, scale: mockupScale }}
          initial={reduced ? undefined : { opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.45, type: 'spring', stiffness: 100, damping: 20 }}
          className="perspective-1000 relative z-10 mx-auto mt-16 max-w-4xl"
        >
          <div className="glass-card overflow-hidden rounded-2xl border border-primary/15 shadow-2xl shadow-primary/5">
            {/* Browser chrome */}
            <div className="flex items-center gap-2 border-b border-primary/10 bg-card/60 px-4 py-3">
              <span className="h-3 w-3 rounded-full bg-destructive/60" />
              <span className="h-3 w-3 rounded-full bg-yellow-500/60" />
              <span className="h-3 w-3 rounded-full bg-green-500/60" />
              <div className="ml-3 flex-1 rounded-md bg-muted/40 px-3 py-1 text-xs text-muted-foreground/60">
                cognit.app/dashboard
              </div>
            </div>

            {/* Mock dashboard content */}
            <div className="bg-background/80 p-6 sm:p-8">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <div className="h-4 w-32 rounded bg-foreground/10" />
                  <div className="mt-2 h-3 w-48 rounded bg-muted-foreground/10" />
                </div>
                <div className="h-9 w-24 rounded-lg bg-primary/15" />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  { icon: Layers, label: 'Automata Theory', count: '24 cards', bgClass: 'bg-primary/10', borderClass: 'border-primary/20', textClass: 'text-primary' },
                  { icon: Brain, label: 'Data Structures', count: '18 cards', bgClass: 'bg-neon/10', borderClass: 'border-neon/20', textClass: 'text-neon' },
                  { icon: BarChart3, label: 'Linear Algebra', count: '31 cards', bgClass: 'bg-primary/10', borderClass: 'border-primary/20', textClass: 'text-primary' },
                ].map((deck) => (
                  <div
                    key={deck.label}
                    className="rounded-xl border border-primary/10 bg-card/40 p-4 backdrop-blur-sm"
                  >
                    <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-lg ${deck.bgClass} border ${deck.borderClass}`}>
                      <deck.icon className={`h-4.5 w-4.5 ${deck.textClass}`} />
                    </div>
                    <div className="text-sm font-medium">{deck.label}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{deck.count}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Glow underneath the mockup */}
          <div className="absolute -inset-x-10 -bottom-10 -z-10 h-40 rounded-full bg-primary/10 blur-3xl" />
        </motion.div>
      </div>

      {/* ── Background decorations (above the global orbs) ── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -left-32 top-0 h-[500px] w-[500px] rounded-full bg-gradient-to-br from-primary/10 via-neon/5 to-transparent blur-3xl" />
        <div className="absolute -right-32 top-32 h-[400px] w-[400px] rounded-full bg-gradient-to-bl from-neon/10 via-primary/5 to-transparent blur-3xl" />
      </div>
    </section>
  );
}
