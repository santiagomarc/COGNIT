import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { CreateDeckForm } from '@/components/ui/shared/CreateDeckForm';
import { DeckActions } from '@/components/ui/shared/DeckActions';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ThemeToggle } from '@/components/ThemeToggle';
import { StaggerContainer, StaggerItem, FadeInUp } from '@/components/motion';
import { BookOpen, Layers } from 'lucide-react';

export default async function Dashboard() {
  // 1. Open the secure connection
  const supabase = await createClient();

  // 2. Check Auth (Security Guard)
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login'); // Kick them out if not logged in
  }

  // 3. Fetch Data (The "await" keyword in action!)
  // "Select all decks where user_id equals the current user"
  // Note: We don't need 'where user_id = ...' because our RLS policy handles that automatically!
  const { data: decks } = await supabase
    .from('decks')
    .select('*')
    .order('created_at', { ascending: false });

  return (
    <div className="container mx-auto p-6 md:p-8 space-y-8">
      {/* Header Section */}
      <FadeInUp>
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
              <Layers className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="glow-title text-2xl md:text-3xl font-bold tracking-tight">Dashboard</h1>
              <p className="text-sm text-muted-foreground">Welcome back, {user.email}</p>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </FadeInUp>

      <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
        {/* The Create Form (Left Side) */}
        <FadeInUp delay={0.1}>
          <CreateDeckForm />
        </FadeInUp>

        {/* The List of Decks (Right Side) */}
        <div className="col-span-1 md:col-span-2">
          {decks?.length === 0 ? (
            <FadeInUp delay={0.2}>
              <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-primary/20 bg-card/40 backdrop-blur-md p-8 text-center">
                <BookOpen className="mb-4 h-10 w-10 text-muted-foreground" />
                <p className="text-muted-foreground">No decks yet. Create one to get started!</p>
              </div>
            </FadeInUp>
          ) : (
            <StaggerContainer className="grid gap-4 md:grid-cols-2">
              {decks?.map((deck) => (
                <StaggerItem key={deck.id}>
                  <Card className="glass-card glow-border group relative rounded-2xl transition-all duration-300">
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <Link href={`/dashboard/${deck.id}`} className="space-y-1.5 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          <CardTitle className="group-hover:text-primary transition-colors duration-200">{deck.title}</CardTitle>
                          <CardDescription className="text-xs">
                            {new Date(deck.created_at).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </CardDescription>
                        </Link>
                        <DeckActions deckId={deck.id} currentTitle={deck.title} />
                      </div>
                    </CardHeader>
                  </Card>
                </StaggerItem>
              ))}
            </StaggerContainer>
          )}
        </div>
      </div>
    </div>
  );
}