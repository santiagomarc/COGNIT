'use server';

import { after } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import {
  createCardSchema, CreateCardInput,
  updateCardSchema, UpdateCardInput,
  bulkImportSchema, BulkImportInput,
} from '@/lib/schemas';
import { sanitizeDatabaseError } from '@/lib/server-errors';
import { recordAiUsage, requireOwnedDeck, reserveAiCall, touchDeckUpdatedAt } from './_shared';
import { logger } from '@/lib/logger';
import { embedTexts, toVectorLiteral } from '@/lib/embeddings';

const BULK_DELETE_MAX_COUNT = 200;

const uuidSchema = z.uuid();
const deleteCardSchema = z.object({ card_id: uuidSchema, deck_id: uuidSchema });
const bulkDeleteSchema = z.object({
  deck_id: uuidSchema,
  card_ids: z.array(uuidSchema).min(1, { message: 'No cards selected.' }).max(BULK_DELETE_MAX_COUNT),
});

function trimNullableString(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function createCard(data: CreateCardInput) {
  const result = createCardSchema.safeParse(data);

  if (!result.success) {
    return { error: result.error.flatten().fieldErrors };
  }

  const deckAccess = await requireOwnedDeck(result.data.deck_id);
  if ('error' in deckAccess) {
    return { error: deckAccess.error === 'You must be logged in.' ? 'You must be logged in to add a card.' : deckAccess.error };
  }

  const { supabase, user } = deckAccess;

  const { data: insertedCard, error } = await supabase
    .from('cards')
    .insert({
      deck_id: result.data.deck_id,
      front: result.data.front,
      back: result.data.back,
      source: result.data.source ?? 'manual',
      imported_by: trimNullableString(result.data.imported_by),
    })
    .select('id')
    .single();

  if (error) {
    logger.error('createCard', 'db error', { code: error.code, message: error.message });
    return { error: sanitizeDatabaseError(error, 'Failed to create card.') };
  }

  await touchDeckUpdatedAt(supabase, result.data.deck_id, user.id);

  revalidatePath(`/dashboard/${result.data.deck_id}`);
  revalidatePath('/dashboard');
  return { success: true, cardId: insertedCard?.id ?? null };
}

export async function updateCard(data: UpdateCardInput) {
  const result = updateCardSchema.safeParse(data);

  if (!result.success) {
    return { error: result.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'You must be logged in to update a card.' };
  }

  // Verify deck ownership
  const { data: ownedDeck, error: deckError } = await supabase
    .from('decks')
    .select('id')
    .eq('id', result.data.deck_id)
    .eq('user_id', user.id)
    .single();

  if (deckError || !ownedDeck) {
    return { error: 'Deck not found or access denied.' };
  }

  // Every derived field is dropped with the text that produced it: distractors,
  // the identification question, the hint, tags, the mnemonic and the vector.
  const updatePayload = {
    front: result.data.front,
    back: result.data.back,
    mcq_distractors: null,
    id_question: null,
    ai_hint: null,
    topic_tags: null,
    mnemonic: null,
    embedding: null,
  };

  const { data: updated, error } = await supabase
    .from('cards')
    .update(updatePayload)
    .eq('id', result.data.id)
    .eq('deck_id', result.data.deck_id)
    .select('id')
    .maybeSingle();

  if (error) {
    logger.error('updateCard', 'db error', { code: error.code, message: error.message });
    return { error: sanitizeDatabaseError(error, 'Failed to update card.') };
  }

  if (!updated) {
    return { error: 'Card not found or access denied.' };
  }

  await touchDeckUpdatedAt(supabase, result.data.deck_id, user.id);

  revalidatePath(`/dashboard/${result.data.deck_id}`);
  revalidatePath('/dashboard');

  // Re-embed off the response path, reserved like every other model call
  // (invariant #7). This used to run inline, unreserved and unguarded: an
  // uncounted embedding per edit and 300–800 ms on every save. A refused
  // reservation simply leaves `embedding` null; the deck-chat sync button
  // picks the card up with the rest of the pending ones.
  const cardId = result.data.id;
  const deckId = result.data.deck_id;
  const textToEmbed = `${result.data.front}\n${result.data.back}`.trim();
  if (textToEmbed) {
    after(async () => {
      const reservation = await reserveAiCall(supabase, user.id, 'sync_embeddings', { card_id: cardId, trigger: 'update_card' });
      if (!reservation.ok) {
        logger.info('updateCard', 'embedding deferred to the next sync', { cardId, reason: reservation.error });
        return;
      }
      try {
        // embedTexts already runs under withGeminiRetry.
        const [vector] = await embedTexts([textToEmbed], { taskType: 'RETRIEVAL_DOCUMENT' });
        if (!vector) return;
        const { error: embedError } = await supabase
          .from('cards')
          .update({ embedding: toVectorLiteral(vector) })
          .eq('id', cardId)
          .eq('deck_id', deckId);
        if (embedError) {
          logger.warn('updateCard', 'embedding write failed', { cardId, message: embedError.message });
        }
        await recordAiUsage(supabase, user.id, 'sync_embeddings', { card_id: cardId, synced_cards: embedError ? 0 : 1 }, reservation.reservationId);
      } catch (embedErr) {
        logger.warn('updateCard', 'embedding skipped', {
          cardId,
          message: embedErr instanceof Error ? embedErr.message : String(embedErr),
        });
      }
    });
  }

  return { success: true };
}

export async function bulkImportCards(data: BulkImportInput) {
  const result = bulkImportSchema.safeParse(data);
  if (!result.success) {
    return { error: result.error.flatten().fieldErrors };
  }

  const deckAccess = await requireOwnedDeck(result.data.deck_id);
  if ('error' in deckAccess) {
    return { error: deckAccess.error };
  }

  const { supabase, user } = deckAccess;
  const rows = result.data.cards.map((card) => ({
    deck_id: result.data.deck_id,
    front: card.front,
    back: card.back,
    source: 'bulk_import' as const,
    imported_by: trimNullableString(result.data.imported_by),
  }));

  const { data: insertedCards, error } = await supabase
    .from('cards')
    .insert(rows)
    .select('id');

  if (error) {
    logger.error('bulkImportCards', 'db error', { code: error.code, message: error.message });
    return { error: sanitizeDatabaseError(error, 'Failed to import cards.') };
  }

  await touchDeckUpdatedAt(supabase, result.data.deck_id, user.id);

  revalidatePath(`/dashboard/${result.data.deck_id}`);
  revalidatePath('/dashboard');

  return {
    success: true,
    count: insertedCards?.length ?? 0,
    cardIds: (insertedCards ?? []).map((card) => card.id),
  };
}

export async function deleteCard(cardId: string, deckId: string) {
  const parsed = deleteCardSchema.safeParse({ card_id: cardId, deck_id: deckId });
  if (!parsed.success) {
    return { error: 'Invalid card or deck id.' };
  }

  const deckAccess = await requireOwnedDeck(parsed.data.deck_id);
  if ('error' in deckAccess) {
    return { error: deckAccess.error === 'You must be logged in.' ? 'Unauthorized' : deckAccess.error };
  }

  const { supabase, user } = deckAccess;

  const { data: deleted, error } = await supabase
    .from('cards')
    .delete()
    .eq('id', parsed.data.card_id)
    .eq('deck_id', parsed.data.deck_id)
    .select('id')
    .maybeSingle();

  if (error) {
    logger.error('deleteCard', 'db error', { code: error.code, message: error.message });
    return { error: sanitizeDatabaseError(error, 'Failed to delete card.') };
  }

  if (!deleted) {
    return { error: 'Card not found or access denied.' };
  }

  await touchDeckUpdatedAt(supabase, parsed.data.deck_id, user.id);

  revalidatePath(`/dashboard/${parsed.data.deck_id}`);
  revalidatePath('/dashboard');
  return { success: true };
}

export async function bulkDeleteCards(cardIds: string[], deckId: string) {
  const normalizedIds = Array.from(
    new Set(
      (Array.isArray(cardIds) ? cardIds : [])
        .map((id) => (typeof id === 'string' ? id.trim() : ''))
        .filter((id) => id.length > 0)
    )
  );

  if (normalizedIds.length === 0) {
    return { error: 'No cards selected.' };
  }

  if (normalizedIds.length > BULK_DELETE_MAX_COUNT) {
    return { error: `You can delete at most ${BULK_DELETE_MAX_COUNT} cards at once.` };
  }

  const parsed = bulkDeleteSchema.safeParse({ deck_id: deckId, card_ids: normalizedIds });
  if (!parsed.success) {
    return { error: 'Invalid card or deck id.' };
  }

  const deckAccess = await requireOwnedDeck(parsed.data.deck_id);
  if ('error' in deckAccess) {
    return { error: deckAccess.error === 'You must be logged in.' ? 'Unauthorized' : deckAccess.error };
  }

  const { supabase, user } = deckAccess;

  const { data: rpcDeletedCount, error: rpcError } = await supabase.rpc('delete_owned_cards_batch', {
    p_deck_id: parsed.data.deck_id,
    p_card_ids: parsed.data.card_ids,
  });

  if (rpcError) {
    logger.error('bulkDeleteCards', 'rpc error', { code: rpcError.code, message: rpcError.message });
    return { error: sanitizeDatabaseError(rpcError, 'Failed to delete selected cards.') };
  }

  const parsedDeletedCount = typeof rpcDeletedCount === 'number'
    ? rpcDeletedCount
    : Number(rpcDeletedCount ?? 0);
  const deletedCount = Number.isFinite(parsedDeletedCount) ? parsedDeletedCount : 0;

  if (deletedCount > 0) {
    await touchDeckUpdatedAt(supabase, parsed.data.deck_id, user.id);
  }

  revalidatePath(`/dashboard/${parsed.data.deck_id}`);
  revalidatePath(`/dashboard/${parsed.data.deck_id}/study`);
  revalidatePath(`/dashboard/${parsed.data.deck_id}/quiz`);
  revalidatePath('/dashboard');
  return { success: true, deletedCount, requestedCount: parsed.data.card_ids.length };
}

export async function getDeckCardsPage(deckId: string, offset: number, limit = 60) {
  const deckAccess = await requireOwnedDeck(deckId);
  if ('error' in deckAccess) {
    return { error: deckAccess.error };
  }

  const { supabase } = deckAccess;
  const safeLimit = Math.min(Math.max(1, limit), 100);
  const safeOffset = Math.max(0, offset);

  const { data: cards, error } = await supabase
    .from('cards')
    .select('id, deck_id, front, back, created_at, source, imported_by, mcq_distractors, id_question, topic_tags')
    .eq('deck_id', deckId)
    .order('created_at', { ascending: false })
    .range(safeOffset, safeOffset + safeLimit - 1);

  if (error) {
    logger.error('getDeckCardsPage', 'Failed to fetch cards page', { error: error.message, deckId });
    return { error: sanitizeDatabaseError(error, 'Failed to fetch cards.') };
  }

  return {
    success: true as const,
    cards: (cards ?? []).map((card) => ({
      ...card,
      created_at: card.created_at ?? new Date().toISOString(),
      source: card.source as import('@/index').CardSource,
      mcq_distractors: Array.isArray(card.mcq_distractors)
        ? (card.mcq_distractors.filter((x): x is string => typeof x === 'string'))
        : null,
      topic_tags: Array.isArray(card.topic_tags)
        ? (card.topic_tags.filter((x): x is string => typeof x === 'string'))
        : null,
    })),
  };
}

