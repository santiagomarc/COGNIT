import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { CreateDeckForm } from '@/components/ui/shared/CreateDeckForm';
import { DeckActions } from '@/components/ui/shared/DeckActions';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

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
    <div className="container mx-auto p-8 space-y-8">
      {/* Header Section */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Welcome back, {user.email}</p>
      </div>

      <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
        {/* The Create Form (Left Side) */}
        <CreateDeckForm />

        {/* The List of Decks (Right Side) */}
        <div className="col-span-1 md:col-span-2 grid gap-4 md:grid-cols-2">
          {decks?.length === 0 ? (
            <p className="text-muted-foreground col-span-2 text-center py-10">
              No decks yet. Create one to get started!
            </p>
          ) : (
            decks?.map((deck) => (
              <Card key={deck.id} className="group relative transition-shadow hover:shadow-md">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <Link href={`/dashboard/${deck.id}`} className="space-y-1 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <CardTitle className="group-hover:text-primary transition-colors">{deck.title}</CardTitle>
                      <CardDescription>
                        {new Date(deck.created_at).toLocaleDateString()}
                      </CardDescription>
                    </Link>
                    <DeckActions deckId={deck.id} currentTitle={deck.title} />
                  </div>
                </CardHeader>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}