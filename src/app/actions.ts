'use server'; // <--- This marks all functions in this file as "Backend Only"

import { createClient } from '@/lib/supabase/server';
import {
  createDeckSchema, CreateDeckInput,
  createCardSchema, CreateCardInput,
  updateCardSchema, UpdateCardInput,
  gradeCardSchema, GradeCardInput,
  generateCardsSchema,
} from '@/lib/schemas';
import { sm2, GRADE_MAP, type StudyGrade } from '@/lib/sm2';
import type { CardState } from '@/index';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PDFParse } from 'pdf-parse';

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

// ═══════════════════════════════════════════════════════════════════
// AI CARD GENERATION
// ═══════════════════════════════════════════════════════════════════

/** Max PDF size we allow (10 MB). */
const MAX_PDF_BYTES = 10 * 1024 * 1024;
/** Max characters we send to Gemini (with 1M context window, this is generous). */
const MAX_TEXT_CHARS = 120_000;

/**
 * Accept a FormData containing a PDF file + metadata, extract text,
 * call OpenAI to generate flashcards, and batch-insert them.
 *
 * FormData shape:
 *   - file: File (application/pdf)
 *   - deck_id: string (uuid)
 *   - count: string (number, optional — defaults to 10)
 */
export async function generateCards(formData: FormData) {
  // ── 1. Auth ──
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'You must be logged in.' };
  }

  // ── 2. Parse & validate metadata ──
  const deckId = formData.get('deck_id') as string;
  const countRaw = formData.get('count');
  const count = countRaw ? Number(countRaw) : 10;

  const parsed = generateCardsSchema.safeParse({ deck_id: deckId, count });
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  // ── 3. Verify deck ownership ──
  const { data: deck, error: deckErr } = await supabase
    .from('decks')
    .select('id')
    .eq('id', parsed.data.deck_id)
    .eq('user_id', user.id)
    .single();

  if (deckErr || !deck) {
    return { error: 'Deck not found or access denied.' };
  }

  // ── 4. Read the PDF file ──
  const file = formData.get('file');
  if (!file || !(file instanceof File)) {
    return { error: 'A PDF file is required.' };
  }
  if (file.size > MAX_PDF_BYTES) {
    return { error: 'PDF must be under 10 MB.' };
  }
  if (file.type !== 'application/pdf') {
    return { error: 'Only PDF files are supported.' };
  }

  // ── 5. Extract text with pdf-parse ──
  let extractedText: string;
  try {
    const arrayBuf = await file.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuf);
    const pdf = new PDFParse({ data: uint8 });
    const textResult = await pdf.getText();
    extractedText = textResult.text;
    await pdf.destroy();
  } catch {
    return { error: 'Failed to read the PDF. It may be scanned or corrupted.' };
  }

  if (!extractedText || extractedText.trim().length < 50) {
    return { error: 'The PDF does not contain enough readable text (minimum ~50 characters).' };
  }

  // Truncate to stay within token limits
  const trimmedText = extractedText.slice(0, MAX_TEXT_CHARS);

  // ── 6. Call Gemini 2.0 Flash ──
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { error: 'GEMINI_API_KEY is not configured on the server.' };
  }

  const genai = new GoogleGenerativeAI(apiKey);
  const model = genai.getGenerativeModel({
    model: 'gemini-2.0-flash',
    generationConfig: {
      temperature: 0.7,
      responseMimeType: 'application/json',
    },
  });

  const systemPrompt = [
    'You are an expert educator that creates high-quality flashcards for active recall study.',
    'Given a body of text, generate exactly the requested number of flashcards.',
    'Each flashcard has a concise "front" (a question or prompt) and a clear "back" (the answer).',
    'Cover the most important concepts, definitions, and relationships in the text.',
    'Vary question types: definitions, comparisons, cause/effect, true/false, fill-in-the-blank.',
    'Return ONLY valid JSON in this exact shape:',
    '{ "cards": [ { "front": "...", "back": "..." } ] }',
  ].join('\n');

  let cards: { front: string; back: string }[];
  try {
    const result = await model.generateContent({
      systemInstruction: systemPrompt,
      contents: [
        {
          role: 'user',
          parts: [
            { text: `Generate ${parsed.data.count} flashcards from the following text:\n\n${trimmedText}` },
          ],
        },
      ],
    });

    const raw = result.response.text();
    const json = JSON.parse(raw);

    if (!Array.isArray(json.cards)) {
      return { error: 'AI returned an unexpected format. Please try again.' };
    }

    // Validate each card has front + back strings
    cards = json.cards
      .filter(
        (c: unknown): c is { front: string; back: string } =>
          typeof c === 'object' &&
          c !== null &&
          typeof (c as Record<string, unknown>).front === 'string' &&
          typeof (c as Record<string, unknown>).back === 'string' &&
          (c as Record<string, unknown>).front !== '' &&
          (c as Record<string, unknown>).back !== ''
      )
      .slice(0, parsed.data.count);

    if (cards.length === 0) {
      return { error: 'AI could not generate valid cards from this PDF.' };
    }
  } catch {
    return { error: 'AI generation failed. Please check your GEMINI_API_KEY and try again.' };
  }

  // ── 7. Batch insert into the cards table ──
  const rows = cards.map((c) => ({
    deck_id: parsed.data.deck_id,
    front: c.front.slice(0, 1000),
    back: c.back.slice(0, 2000),
  }));

  const { error: insertErr } = await supabase.from('cards').insert(rows);
  if (insertErr) {
    return { error: 'Cards were generated but failed to save: ' + insertErr.message };
  }

  revalidatePath(`/dashboard/${parsed.data.deck_id}`);
  revalidatePath('/dashboard');

  return {
    success: true,
    count: cards.length,
    cards: cards.map((c) => ({ front: c.front, back: c.back })),
  };
}
