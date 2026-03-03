'use server'; // <--- This marks all functions in this file as "Backend Only"

import { createClient } from '@/lib/supabase/server';
import {
  createDeckSchema, CreateDeckInput,
  createCardSchema, CreateCardInput,
  updateCardSchema, UpdateCardInput,
  gradeCardSchema, GradeCardInput,
} from '@/lib/schemas';
import { sm2, GRADE_MAP, type StudyGrade } from '@/lib/sm2';
import type { CardState } from '@/index';
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

  // 4. Refresh the UI
  revalidatePath('/dashboard');
  return { success: true };
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

export async function createCard(data: CreateCardInput) {
  const result = createCardSchema.safeParse(data);

  if (!result.success) {
    return { error: result.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'You must be logged in to add a card.' };
  }

  const { data: ownedDeck, error: deckError } = await supabase
    .from('decks')
    .select('id')
    .eq('id', result.data.deck_id)
    .eq('user_id', user.id)
    .single();

  if (deckError || !ownedDeck) {
    return { error: 'Deck not found or access denied.' };
  }

  const { error } = await supabase
    .from('cards')
    .insert({
      deck_id: result.data.deck_id,
      front: result.data.front,
      back: result.data.back,
    });

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/dashboard/${result.data.deck_id}`);
  revalidatePath('/dashboard');
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

  const { error } = await supabase
    .from('cards')
    .update({
      front: result.data.front,
      back: result.data.back,
    })
    .eq('id', result.data.id)
    .eq('deck_id', result.data.deck_id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/dashboard/${result.data.deck_id}`);
  return { success: true };
}

export async function deleteCard(cardId: string, deckId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Unauthorized' };
  }

  // Verify deck ownership
  const { data: ownedDeck, error: deckError } = await supabase
    .from('decks')
    .select('id')
    .eq('id', deckId)
    .eq('user_id', user.id)
    .single();

  if (deckError || !ownedDeck) {
    return { error: 'Deck not found or access denied.' };
  }

  const { error } = await supabase
    .from('cards')
    .delete()
    .eq('id', cardId)
    .eq('deck_id', deckId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/dashboard/${deckId}`);
  revalidatePath('/dashboard');
  return { success: true };
}

// ═══════════════════════════════════════════════════════════════════
// STUDY / SM-2 GRADING
// ═══════════════════════════════════════════════════════════════════

/**
 * Grade a card using the SM-2 spaced repetition algorithm.
 *
 * 1. Validates input with Zod
 * 2. Fetches current SM-2 state from the DB
 * 3. Runs SM-2 to calculate the next review schedule
 * 4. Updates the card row
 * 5. Inserts a study_log entry (immutable history)
 */
export async function gradeCard(data: GradeCardInput) {
  const result = gradeCardSchema.safeParse(data);
  if (!result.success) {
    return { error: result.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'You must be logged in.' };
  }

  // Verify deck ownership
  const { data: deck, error: deckErr } = await supabase
    .from('decks')
    .select('id')
    .eq('id', result.data.deck_id)
    .eq('user_id', user.id)
    .single();

  if (deckErr || !deck) {
    return { error: 'Deck not found or access denied.' };
  }

  // Fetch current card state
  const { data: card, error: cardErr } = await supabase
    .from('cards')
    .select('id, state, interval, ease_factor, repetition_count')
    .eq('id', result.data.card_id)
    .eq('deck_id', result.data.deck_id)
    .single();

  if (cardErr || !card) {
    return { error: 'Card not found.' };
  }

  // Run SM-2 algorithm
  const numericGrade = GRADE_MAP[result.data.grade as StudyGrade];
  const sm2Result = sm2(numericGrade, {
    repetitionCount: card.repetition_count ?? 0,
    easeFactor: card.ease_factor ?? 2.5,
    interval: card.interval ?? 0,
    state: (card.state as CardState) ?? 'new',
  });

  // Update the card
  const { error: updateErr } = await supabase
    .from('cards')
    .update({
      state: sm2Result.state,
      interval: sm2Result.interval,
      ease_factor: sm2Result.easeFactor,
      repetition_count: sm2Result.repetitionCount,
      next_review_at: sm2Result.nextReviewAt.toISOString(),
      last_review_at: new Date().toISOString(),
    })
    .eq('id', card.id)
    .eq('deck_id', result.data.deck_id);

  if (updateErr) {
    return { error: 'Failed to update card schedule.' };
  }

  // Insert study log (immutable audit trail)
  await supabase.from('study_logs').insert({
    user_id: user.id,
    card_id: card.id,
    grade: numericGrade,
    review_duration_ms: result.data.duration_ms ?? 0,
  });

  return {
    success: true,
    nextReviewAt: sm2Result.nextReviewAt.toISOString(),
    interval: sm2Result.interval,
    state: sm2Result.state,
  };
}
