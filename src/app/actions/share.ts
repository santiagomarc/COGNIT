'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireOwnedDeck } from './_shared';
import { sanitizeDatabaseError } from '@/lib/server-errors';
import { guardAction } from '@/lib/action-guard';
import { logger } from '@/lib/logger';

const setSharingSchema = z.object({
  deck_id: z.uuid({ message: 'Invalid deck id' }),
  enabled: z.boolean(),
  rotate: z.boolean().default(false),
});

export type SetDeckSharingInput = z.infer<typeof setSharingSchema>;

export async function setDeckSharing(data: SetDeckSharingInput) {
  return guardAction('Deck sharing', async () => {
    const parsed = setSharingSchema.safeParse(data);
    if (!parsed.success) {
      return { error: parsed.error.flatten().fieldErrors as never };
    }

    const deckAccess = await requireOwnedDeck(parsed.data.deck_id);
    if ('error' in deckAccess) {
      return { error: deckAccess.error };
    }

    const { data: token, error } = await deckAccess.supabase.rpc('set_deck_sharing', {
      p_deck_id: parsed.data.deck_id,
      p_enabled: parsed.data.enabled,
      p_rotate: parsed.data.rotate,
    });

    if (error) {
      logger.error('setDeckSharing', 'rpc failed', { message: error.message });
      return {
        error: error.message.includes('not found')
          ? 'Deck not found or access denied.'
          : sanitizeDatabaseError(error, 'Failed to update sharing.'),
      };
    }

    revalidatePath(`/dashboard/${parsed.data.deck_id}`);
    return { success: true as const, shareToken: token ?? null };
  });
}

export async function cloneSharedDeck(shareToken: string) {
  return guardAction('Deck import', async () => {
    if (typeof shareToken !== 'string' || !/^[a-f0-9]{32}$/.test(shareToken)) {
      return { error: 'That share link is not valid.' };
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { error: 'Sign in to save this deck to your library.' };
    }

    const { data: deckId, error } = await supabase.rpc('clone_shared_deck', {
      p_share_token: shareToken,
    });

    if (error || !deckId) {
      // The RPC raises human-readable messages for the two expected cases;
      // anything else gets the generic sanitiser.
      const message = error?.message ?? '';
      return {
        error: message.includes('no longer shared')
          ? 'This deck is no longer shared.'
          : message.includes('too large')
            ? 'That deck is too large to import (limit 1000 cards).'
            : sanitizeDatabaseError(error, 'Failed to import this deck.'),
      };
    }

    revalidatePath('/dashboard');
    return { success: true as const, deckId };
  });
}
