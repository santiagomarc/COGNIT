import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

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
      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <div className="max-w-3xl space-y-6">
          {/* Logo/Brand */}
          <h1 className="text-5xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            Cognit
          </h1>
          
          {/* Tagline */}
          <p className="text-xl text-muted-foreground">
            The Universal Active Recall Engine
          </p>
          
          {/* Description */}
          <p className="text-lg text-muted-foreground max-w-xl mx-auto">
            Transform any study material into an interactive learning experience. 
            Upload PDFs, let AI generate smart flashcards, and master any subject 
            with spaced repetition.
          </p>
          
          {/* CTA Buttons */}
          <div className="flex gap-4 justify-center pt-4">
            <Link href="/login">
              <Button size="lg">
                Get Started
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="outline" size="lg">
                Sign In
              </Button>
            </Link>
          </div>
          
          {/* Feature highlights */}
          <div className="grid md:grid-cols-3 gap-6 pt-12 text-left">
            <div className="p-4 rounded-lg border bg-card">
              <h3 className="font-semibold mb-2">📄 PDF to Flashcards</h3>
              <p className="text-sm text-muted-foreground">
                Upload any document and let AI extract key concepts automatically.
              </p>
            </div>
            <div className="p-4 rounded-lg border bg-card">
              <h3 className="font-semibold mb-2">🧠 Smart Grading</h3>
              <p className="text-sm text-muted-foreground">
                AI validates your understanding, not just keyword matching.
              </p>
            </div>
            <div className="p-4 rounded-lg border bg-card">
              <h3 className="font-semibold mb-2">📈 Spaced Repetition</h3>
              <p className="text-sm text-muted-foreground">
                SM-2 algorithm ensures you review at the optimal time.
              </p>
            </div>
          </div>
        </div>
      </main>
      
      {/* Footer */}
      <footer className="p-4 text-center text-sm text-muted-foreground border-t">
        Built with Next.js, Supabase, and OpenAI
      </footer>
    </div>
  );
}