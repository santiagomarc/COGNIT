'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { guardAction } from '@/lib/action-guard';
import { sanitizeDatabaseError } from '@/lib/server-errors';
import { getRequestClient, getSessionUser } from '@/lib/supabase/session';

/*
 * Deck lifecycle (plan §4.1): trash with undo, restore, delete forever,
 * duplicate, merge, and directory listing. Every write is one SECURITY
 * INVOKER RPC (202609240900–0930); these actions validate, call it once and
 * revalidate.
 */

const deckId = z.uuid();
const duplicateSchema = z.object({ deck_id: z.uuid(), title: z.string().trim().max(120).optional(), keep_progress: z.boolean().default(false) });
const mergeSchema = z.object({ source_id: z.uuid(), target_id: z.uuid() }).refine((value) => value.source_id !== value.target_id, { message: 'Choose two different decks.' });
const listingSchema = z.object({ deck_id: z.uuid(), listed: z.boolean() });

async function signedIn() {
  const [supabase, user] = await Promise.all([getRequestClient(), getSessionUser()]);
  return user ? { supabase, user } : null;
}

export type TrashedDeck = { id: string; title: string; deletedAt: string; purgeAfter: string; cardCount: number };

/** Moves a deck to the trash. The toast's Undo calls `restoreDeck`. */
export async function trashDeck(id: string) {
  return guardAction('Deck delete', async () => {
    const parsed = deckId.safeParse(id);
    if (!parsed.success) return { error: 'Invalid deck id.' };
    const session = await signedIn();
    if (!session) return { error: 'You must be logged in.' };

    const { data, error } = await session.supabase.rpc('trash_deck', { p_deck_id: parsed.data });
    if (error) return { error: sanitizeDatabaseError(error, 'Failed to delete the deck.') };

    revalidatePath('/dashboard');
    return { success: true as const, deletedAt: data };
  });
}

export async function restoreDeck(id: string) {
  return guardAction('Deck restore', async () => {
    const parsed = deckId.safeParse(id);
    if (!parsed.success) return { error: 'Invalid deck id.' };
    const session = await signedIn();
    if (!session) return { error: 'You must be logged in.' };

    const { error } = await session.supabase.rpc('restore_deck', { p_deck_id: parsed.data });
    if (error) return { error: sanitizeDatabaseError(error, 'Failed to restore the deck.') };

    revalidatePath('/dashboard');
    revalidatePath(`/dashboard/${parsed.data}`);
    return { success: true as const };
  });
}

/** The trash, after purging anything past its 30 days (no cron needed for active users). */
export async function listTrashedDecks() {
  return guardAction('Trash', async () => {
    const session = await signedIn();
    if (!session) return { error: 'You must be logged in.' };

    await session.supabase.rpc('purge_expired_trash');
    const { data, error } = await session.supabase.rpc('list_trashed_decks');
    if (error) return { error: sanitizeDatabaseError(error, 'Failed to load the trash.') };

    const decks: TrashedDeck[] = (data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      deletedAt: row.deleted_at,
      purgeAfter: row.purge_after,
      cardCount: Number(row.card_count),
    }));
    return { success: true as const, decks };
  });
}

export async function purgeDeck(id: string) {
  return guardAction('Deck purge', async () => {
    const parsed = deckId.safeParse(id);
    if (!parsed.success) return { error: 'Invalid deck id.' };
    const session = await signedIn();
    if (!session) return { error: 'You must be logged in.' };

    const { error } = await session.supabase.rpc('purge_deck', { p_deck_id: parsed.data });
    if (error) return { error: sanitizeDatabaseError(error, 'Failed to delete the deck.') };
    return { success: true as const };
  });
}

export async function duplicateDeck(input: z.input<typeof duplicateSchema>) {
  return guardAction('Deck duplicate', async () => {
    const parsed = duplicateSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };
    const session = await signedIn();
    if (!session) return { error: 'You must be logged in.' };

    const { data: newDeckId, error } = await session.supabase.rpc('duplicate_deck', {
      p_deck_id: parsed.data.deck_id,
      p_keep_progress: parsed.data.keep_progress,
      ...(parsed.data.title ? { p_title: parsed.data.title } : {}),
    });
    if (error || !newDeckId) return { error: sanitizeDatabaseError(error, 'Failed to duplicate the deck.') };

    revalidatePath('/dashboard');
    return { success: true as const, deckId: newDeckId };
  });
}

export async function mergeDecks(input: z.input<typeof mergeSchema>) {
  return guardAction('Deck merge', async () => {
    const parsed = mergeSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };
    const session = await signedIn();
    if (!session) return { error: 'You must be logged in.' };

    const { data: moved, error } = await session.supabase.rpc('merge_decks', {
      p_source_id: parsed.data.source_id,
      p_target_id: parsed.data.target_id,
    });
    if (error) return { error: sanitizeDatabaseError(error, 'Failed to merge the decks.') };

    revalidatePath('/dashboard');
    revalidatePath(`/dashboard/${parsed.data.target_id}`);
    return { success: true as const, movedCards: Number(moved ?? 0) };
  });
}

export async function setDeckListing(input: z.input<typeof listingSchema>) {
  return guardAction('Deck listing', async () => {
    const parsed = listingSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };
    const session = await signedIn();
    if (!session) return { error: 'You must be logged in.' };

    const { data, error } = await session.supabase.rpc('set_deck_listing', {
      p_deck_id: parsed.data.deck_id,
      p_listed: parsed.data.listed,
    });
    if (error) return { error: sanitizeDatabaseError(error, 'Failed to update the listing.') };

    revalidatePath(`/dashboard/${parsed.data.deck_id}`);
    revalidatePath('/explore');
    return { success: true as const, listedAt: data ?? null };
  });
}
