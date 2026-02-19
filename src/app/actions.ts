'use server'; // <--- This marks all functions in this file as "Backend Only"

import { createClient } from '@/lib/supabase/server';
import { createDeckSchema, CreateDeckInput } from '@/lib/schemas';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export async function createDeck(data: CreateDeckInput) {
  // 1. "No-Vibe" Validation: Check the data again on the server
  // 1. VALIDATION: Even if the frontend checked it, we check again.
  // .safeParse() returns an object with { success: true/false, error: ... }
  const result = createDeckSchema.safeParse(data);

  if (!result.success) {
    // We flatten the error to make it easier to read (e.g., { title: ["Too short"] })
    return { error: result.error.flatten().fieldErrors };
  }

  // 2. Auth Check: Who is doing this?
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be logged in to create a deck." };
  }

  // 3. Database Mutation
  const { error } = await supabase
    .from('decks')
    .insert({
      title: result.data.title,
      description: result.data.description,
      user_id: user.id, // <--- We strictly bind this to the logged-in user
    });

  if (error) {
    return { error: error.message };
  }

  // 4. Refresh the UI and Redirect
  revalidatePath('/dashboard'); // Tell Next.js to refresh the dashboard list
  redirect('/dashboard');
}

export async function deleteDeck(deckId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Unauthorized" };
  }

  const { error } = await supabase
    .from('decks')
    .delete()
    .eq('id', deckId)
    .eq('user_id', user.id); // Security: Ensure user owns the deck

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/dashboard');
}

export async function updateDeck(deckId: string, title: string) {
  // Simple validation
  if (!title || title.length < 3) {
    return { error: { title: ["Title must be at least 3 characters long"] } };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Unauthorized" };
  }

  const { error } = await supabase
    .from('decks')
    .update({ title })
    .eq('id', deckId)
    .eq('user_id', user.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/dashboard');
}

