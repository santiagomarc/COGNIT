import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';
import { FadeInUp, StaggerContainer, StaggerItem } from '@/components/motion';
import { BookOpen, Brain, TrendingUp } from 'lucide-react';

// This is the LANDING PAGE (root route: /)
// If user is logged in -> send them to dashboard
// If not -> show the marketing/welcome page
export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // If already logged in, skip the landing page
  if (user) {
    redirect('/dashboard');
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <div className="absolute top-4 right-4 z-10">
        <ThemeToggle />
      </div>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <div className="max-w-3xl space-y-6">
          {/* Logo/Brand */}
          <FadeInUp>
            <h1 className="text-6xl md:text-7xl font-extrabold tracking-tighter bg-gradient-to-br from-primary via-neon to-primary/60 bg-clip-text text-transparent drop-shadow-lg">
              Cognit
            </h1>
          </FadeInUp>
          
          {/* Tagline */}
          <FadeInUp delay={0.1}>
            <p className="text-xl md:text-2xl text-muted-foreground font-medium">
              The Universal Active Recall Engine
            </p>
          </FadeInUp>
          
          {/* Description */}
          <FadeInUp delay={0.2}>
            <p className="text-lg text-muted-foreground/80 max-w-xl mx-auto leading-relaxed">
              Transform any study material into an interactive learning experience. 
              Upload PDFs, let AI generate smart flashcards, and master any subject 
              with spaced repetition.
            </p>
          </FadeInUp>
          
          {/* CTA Buttons */}
          <FadeInUp delay={0.3}>
            <div className="flex gap-4 justify-center pt-4">
              <Link href="/login">
                <Button size="lg" className="text-base px-8">
                  Get Started
                </Button>
              </Link>
              <Link href="/login">
                <Button variant="outline" size="lg" className="text-base px-8">
                  Sign In
                </Button>
              </Link>
            </div>
          </FadeInUp>
          
          {/* Feature highlights */}
          <StaggerContainer className="grid md:grid-cols-3 gap-6 pt-12 text-left">
            <StaggerItem>
              <div className="glass-card glow-border p-5 rounded-2xl space-y-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
                  <BookOpen className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold">PDF to Flashcards</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Upload any document and let AI extract key concepts automatically.
                </p>
              </div>
            </StaggerItem>
            <StaggerItem>
              <div className="glass-card glow-border p-5 rounded-2xl space-y-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
                  <Brain className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold">Smart Grading</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  AI validates your understanding, not just keyword matching.
                </p>
              </div>
            </StaggerItem>
            <StaggerItem>
              <div className="glass-card glow-border p-5 rounded-2xl space-y-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
                  <TrendingUp className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold">Spaced Repetition</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  SM-2 algorithm ensures you review at the optimal time.
                </p>
              </div>
            </StaggerItem>
          </StaggerContainer>
        </div>
      </main>
      
      {/* Footer */}
      <footer className="p-4 text-center text-sm text-muted-foreground/60 border-t border-primary/10">
        Built with Next.js, Supabase, and OpenAI
      </footer>
    </div>
  );
}