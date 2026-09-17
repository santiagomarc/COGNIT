'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createDeckSchema, CreateDeckInput } from '@/lib/schemas';
import { sanitizeDatabaseError } from '@/lib/server-errors';
import { buildDeckTitleWithTag, normalizeDeckTag, removeDeckTagFromTitle } from '@/lib/deck-tags';
import { logger } from '@/lib/logger';

const deckIdSchema = z.uuid({ message: 'Invalid deck id' });

const updateDeckSchema = z.object({
  deck_id: deckIdSchema,
  title: z.string().trim().min(3, { message: 'Title must be at least 3 characters long' }).max(200),
  accent_tag: z.string().trim().max(40).nullable().optional(),
});

export async function createDeck(data: CreateDeckInput) {
  // Validate again on the server, whatever the form already checked.
  const result = createDeckSchema.safeParse(data);

  if (!result.success) {
    // Flattened so the client can render it per field (e.g. { title: ["Too short"] }).
    return { error: result.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'You must be logged in to create a deck.' };
  }

  const normalizedTitle = removeDeckTagFromTitle(result.data.title).trim();
  const normalizedTag = normalizeDeckTag(result.data.accent_tag);
  const persistedTitle = buildDeckTitleWithTag(normalizedTitle, normalizedTag);

  const { data: deck, error } = await supabase
    .from('decks')
    .insert({
      title: persistedTitle,
      description: result.data.description,
      user_id: user.id, // Strictly bound to the signed-in user.
    })
    .select('id')
    .single();

  if (error || !deck) {
    if (error) {
      logger.error('createDeck', 'db error', { code: error.code, message: error.message });
    }
    return { error: sanitizeDatabaseError(error, 'Failed to create deck.') };
  }

  revalidatePath('/dashboard');
  return { success: true, deckId: deck.id };
}

/**
 * Every mutation below returns `{ success: true }` or `{ error }` — never
 * `undefined`. They also select the row they touched: a delete or rename that
 * matched nothing (wrong id, someone else's deck) is reported as an error, not
 * as a silent success.
 */
export async function deleteDeck(deckId: string) {
  const parsed = deckIdSchema.safeParse(deckId);
  if (!parsed.success) {
    return { error: 'Invalid deck id.' };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Unauthorized' };
  }

  const { data: deleted, error } = await supabase
    .from('decks')
    .delete()
    .eq('id', parsed.data)
    .eq('user_id', user.id) // Security: the caller must own the deck.
    .select('id')
    .maybeSingle();

  if (error) {
    logger.error('deleteDeck', 'db error', { code: error.code, message: error.message });
    return { error: sanitizeDatabaseError(error, 'Failed to delete deck.') };
  }

  if (!deleted) {
    return { error: 'Deck not found or access denied.' };
  }

  revalidatePath('/dashboard');
  return { success: true as const };
}

export async function updateDeck(deckId: string, title: string, accentTag?: string | null) {
  const parsed = updateDeckSchema.safeParse({ deck_id: deckId, title, accent_tag: accentTag ?? null });
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const normalizedTitle = removeDeckTagFromTitle(parsed.data.title).trim();
  if (normalizedTitle.length < 3) {
    return { error: { title: ['Title must be at least 3 characters long'] } };
  }

  const persistedTitle = buildDeckTitleWithTag(normalizedTitle, normalizeDeckTag(parsed.data.accent_tag));

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Unauthorized' };
  }

  const { data: updated, error } = await supabase
    .from('decks')
    .update({ title: persistedTitle, updated_at: new Date().toISOString() })
    .eq('id', parsed.data.deck_id)
    .eq('user_id', user.id)
    .select('id')
    .maybeSingle();

  if (error) {
    logger.error('updateDeck', 'db error', { code: error.code, message: error.message });
    return { error: sanitizeDatabaseError(error, 'Failed to update deck.') };
  }

  if (!updated) {
    return { error: 'Deck not found or access denied.' };
  }

  revalidatePath('/dashboard');
  revalidatePath(`/dashboard/${parsed.data.deck_id}`);
  return { success: true as const };
}
