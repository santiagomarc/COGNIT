import { FileQuestion, ArrowLeft, Home } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="glass-card glow-border mx-auto max-w-lg rounded-3xl p-10 text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20">
          <FileQuestion className="h-7 w-7 text-primary" />
        </div>

        <h1 className="glow-title text-5xl font-extrabold tracking-tighter bg-gradient-to-br from-primary via-neon to-primary/60 bg-clip-text text-transparent">
          404
        </h1>
        <h2 className="mt-2 text-xl font-semibold tracking-tight">Page not found</h2>
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>

        <div className="mt-7 flex items-center justify-center gap-3">
          <Link href="/dashboard">
            <Button className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Dashboard
            </Button>
          </Link>
          <Link href="/">
            <Button variant="outline" className="gap-2">
              <Home className="h-4 w-4" />
              Home
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
