'use server';

import { createClient } from '@/lib/supabase/server';
import { createDeckSchema, CreateDeckInput } from '@/lib/schemas';
import { revalidatePath } from 'next/cache';
import { sanitizeDatabaseError } from '@/lib/server-errors';
import { buildDeckTitleWithTag, normalizeDeckTag, removeDeckTagFromTitle } from '@/lib/deck-tags';
import { logger } from '@/lib/logger';

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

  const normalizedTitle = removeDeckTagFromTitle(result.data.title).trim();
  const normalizedTag = normalizeDeckTag(result.data.accent_tag);
  const persistedTitle = buildDeckTitleWithTag(normalizedTitle, normalizedTag);

  // 3. Database Mutation
  const { data: deck, error } = await supabase
    .from('decks')
    .insert({
      title: persistedTitle,
      description: result.data.description,
      user_id: user.id, // <--- We strictly bind this to the logged-in user
    })
    .select('id')
    .single();

  if (error || !deck) {
    if (error) {
      logger.error('createDeck', 'db error', { code: error.code, message: error.message });
    }
    return { error: sanitizeDatabaseError(error, 'Failed to create deck.') };
  }

  // 4. Refresh the UI
  revalidatePath('/dashboard');
  return { success: true, deckId: deck.id };
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
    logger.error('deleteDeck', 'db error', { code: error.code, message: error.message });
    return { error: sanitizeDatabaseError(error, 'Failed to delete deck.') };
  }

  revalidatePath('/dashboard');
}

export async function updateDeck(deckId: string, title: string, accentTag?: string | null) {
  // Simple validation
  const normalizedTitle = removeDeckTagFromTitle(title).trim();
  if (!normalizedTitle || normalizedTitle.length < 3) {
    return { error: { title: ["Title must be at least 3 characters long"] } };
  }

  const persistedTitle = buildDeckTitleWithTag(normalizedTitle, normalizeDeckTag(accentTag));

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Unauthorized" };
  }

  const { error } = await supabase
    .from('decks')
    .update({ title: persistedTitle, updated_at: new Date().toISOString() })
    .eq('id', deckId)
    .eq('user_id', user.id);

  if (error) {
    logger.error('updateDeck', 'db error', { code: error.code, message: error.message });
    return { error: sanitizeDatabaseError(error, 'Failed to update deck.') };
  }

  revalidatePath('/dashboard');
}
