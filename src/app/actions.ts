'use server'; // <--- This marks all functions in this file as "Backend Only"

import { createClient } from '@/lib/supabase/server';
import {
  createDeckSchema, CreateDeckInput,
  createCardSchema, CreateCardInput,
  updateCardSchema, UpdateCardInput,
  gradeCardSchema, GradeCardInput,
  logQuizResultSchema, LogQuizResultInput,
  generateCardsSchema,
  bulkImportSchema, BulkImportInput,
  enrichCardsSchema, EnrichCardsInput,
  sanitizeNotesSchema, SanitizeNotesInput,
  getHintSchema, GetHintInput,
} from '@/lib/schemas';
import { sm2, GRADE_MAP, type StudyGrade } from '@/lib/sm2';
import type { CardState } from '@/index';
import { revalidatePath } from 'next/cache';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PDFParse } from 'pdf-parse';

const MAX_PDF_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_CHARS = 120_000;
const ENRICH_BATCH_SIZE = 10;

type EnrichmentRow = {
  id: string;
  mcq_distractors: string[];
  id_question: string;
};

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }

  return new GoogleGenerativeAI(apiKey);
}

function getGeminiJsonModel() {
  const genai = getGeminiClient();
  return genai.getGenerativeModel({
    model: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
    generationConfig: {
      temperature: 0.4,
      responseMimeType: 'application/json',
      maxOutputTokens: Number(process.env.GEMINI_MODEL_MAX_TOKENS) || 4096,
    },
  });
}

function getGeminiTextModel() {
  const genai = getGeminiClient();
  return genai.getGenerativeModel({
    model: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
    generationConfig: {
      temperature: 0.5,
      maxOutputTokens: Number(process.env.GEMINI_MODEL_MAX_TOKENS) || 4096,
    },
  });
}

function trimNullableString(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function requireOwnedDeck(deckId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'You must be logged in.' as const };
  }

  const { data: deck, error } = await supabase
    .from('decks')
    .select('id')
    .eq('id', deckId)
    .eq('user_id', user.id)
    .single();

  if (error || !deck) {
    return { error: 'Deck not found or access denied.' as const };
  }

  return { supabase, user, deck };
}

function parseEnrichmentPayload(raw: string): EnrichmentRow[] {
  const parsed = JSON.parse(raw) as { cards?: unknown };
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.cards)) {
    throw new Error('AI returned an unexpected enrichment format.');
  }

  return parsed.cards.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return [];
    }

    const row = item as Record<string, unknown>;
    const distractors = Array.isArray(row.mcq_distractors)
      ? row.mcq_distractors.filter((value): value is string => typeof value === 'string' && value.trim().length > 0).map((value) => value.trim()).slice(0, 3)
      : [];
    const idQuestion = typeof row.id_question === 'string' ? row.id_question.trim() : '';
    const id = typeof row.id === 'string' ? row.id : '';

    if (!id || !idQuestion || distractors.length < 2) {
      return [];
    }

    return [{ id, mcq_distractors: distractors, id_question: idQuestion }];
  });
}

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

  const deckAccess = await requireOwnedDeck(result.data.deck_id);
  if ('error' in deckAccess) {
    return { error: deckAccess.error === 'You must be logged in.' ? 'You must be logged in to add a card.' : deckAccess.error };
  }

  const { supabase } = deckAccess;

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
    return { error: error.message };
  }

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

  const { error } = await supabase
    .from('cards')
    .update({
      front: result.data.front,
      back: result.data.back,
      mcq_distractors: null,
      id_question: null,
    })
    .eq('id', result.data.id)
    .eq('deck_id', result.data.deck_id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/dashboard/${result.data.deck_id}`);
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

  const { supabase } = deckAccess;
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
    return { error: error.message };
  }

  revalidatePath(`/dashboard/${result.data.deck_id}`);
  revalidatePath('/dashboard');

  return {
    success: true,
    count: insertedCards?.length ?? 0,
    cardIds: (insertedCards ?? []).map((card) => card.id),
  };
}

export async function enrichCards(data: EnrichCardsInput) {
  const result = enrichCardsSchema.safeParse(data);
  if (!result.success) {
    return { error: result.error.flatten().fieldErrors };
  }

  const deckAccess = await requireOwnedDeck(result.data.deck_id);
  if ('error' in deckAccess) {
    return { error: deckAccess.error };
  }

  const { supabase } = deckAccess;
  const uniqueCardIds = [...new Set(result.data.card_ids)];
  const { data: cards, error } = await supabase
    .from('cards')
    .select('id, front, back, mcq_distractors, id_question')
    .eq('deck_id', result.data.deck_id)
    .in('id', uniqueCardIds);

  if (error) {
    return { error: error.message };
  }

  const pendingCards = (cards ?? []).filter((card) => !card.id_question || !Array.isArray(card.mcq_distractors) || card.mcq_distractors.length < 2);
  if (pendingCards.length === 0) {
    return { success: true, enrichedCount: 0, skippedCount: uniqueCardIds.length };
  }

  const model = getGeminiJsonModel();
  const batches = chunkArray(pendingCards, ENRICH_BATCH_SIZE);
  let enrichedCount = 0;
  const failedCardIds: string[] = [];
  const enrichedCards: EnrichmentRow[] = [];

  for (const batch of batches) {
    try {
      const response = await model.generateContent({
        systemInstruction: [
          'You are an expert quiz designer.',
          'For each flashcard, generate exactly 3 plausible but incorrect multiple-choice distractors for the term.',
          'Distractors must be from the same subject area, realistic, and must not be synonyms or alternate spellings of the correct term.',
          'Also rewrite the description as a natural-language identification question whose answer is the term.',
          'Return only valid JSON in this shape:',
          '{ "cards": [{ "id": "...", "mcq_distractors": ["...", "...", "..."], "id_question": "..." }] }',
        ].join('\n'),
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Enrich these flashcards:\n${JSON.stringify(batch.map((card) => ({
                  id: card.id,
                  front: card.front,
                  back: card.back,
                })))}`,
              },
            ],
          },
        ],
      });

      const raw = response.response.text();
      const enrichedRows = parseEnrichmentPayload(raw);

      await Promise.all(
        enrichedRows.map((row) =>
          supabase
            .from('cards')
            .update({
              mcq_distractors: row.mcq_distractors,
              id_question: row.id_question,
            })
            .eq('id', row.id)
            .eq('deck_id', result.data.deck_id)
        )
      );

      enrichedCount += enrichedRows.length;
      enrichedCards.push(...enrichedRows);
      const enrichedIds = new Set(enrichedRows.map((row) => row.id));
      for (const card of batch) {
        if (!enrichedIds.has(card.id)) {
          failedCardIds.push(card.id);
        }
      }
    } catch (batchError) {
      console.error('[enrichCards] batch failed:', batchError);
      failedCardIds.push(...batch.map((card) => card.id));
    }
  }

  revalidatePath(`/dashboard/${result.data.deck_id}`);
  revalidatePath(`/dashboard/${result.data.deck_id}/study`);

  return {
    success: enrichedCount > 0,
    enrichedCount,
    skippedCount: uniqueCardIds.length - pendingCards.length,
    failedCardIds,
    cards: enrichedCards,
  };
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

export async function logQuizResult(data: LogQuizResultInput) {
  const result = logQuizResultSchema.safeParse(data);
  if (!result.success) {
    return { error: result.error.flatten().fieldErrors };
  }

  const deckAccess = await requireOwnedDeck(result.data.deck_id);
  if ('error' in deckAccess) {
    return { error: deckAccess.error };
  }

  const { supabase, user } = deckAccess;
  const uniqueCardIds = [...new Set(result.data.results.map((entry) => entry.card_id))];
  const { data: ownedCards, error: ownedCardsError } = await supabase
    .from('cards')
    .select('id')
    .eq('deck_id', result.data.deck_id)
    .in('id', uniqueCardIds);

  if (ownedCardsError) {
    return { error: ownedCardsError.message };
  }

  const ownedCardIds = new Set((ownedCards ?? []).map((card) => card.id));
  if (ownedCardIds.size !== uniqueCardIds.length) {
    return { error: 'One or more quiz results referenced cards outside this deck.' };
  }

  const correctCards = result.data.results.filter((entry) => entry.correct).length;
  const { data: insertedQuizResult, error: quizResultError } = await supabase
    .from('quiz_results')
    .insert({
      user_id: user.id,
      deck_id: result.data.deck_id,
      mode: result.data.mode,
      total_cards: result.data.results.length,
      correct_cards: correctCards,
      duration_ms: result.data.duration_ms,
    })
    .select('id')
    .single();

  if (quizResultError || !insertedQuizResult) {
    return { error: quizResultError?.message ?? 'Failed to save quiz result.' };
  }

  const { error: quizCardResultsError } = await supabase
    .from('quiz_card_results')
    .insert(
      result.data.results.map((entry) => ({
        quiz_result_id: insertedQuizResult.id,
        card_id: entry.card_id,
        correct: entry.correct,
      }))
    );

  if (quizCardResultsError) {
    return { error: quizCardResultsError.message };
  }

  revalidatePath('/dashboard');
  revalidatePath(`/dashboard/${result.data.deck_id}`);
  revalidatePath(`/dashboard/${result.data.deck_id}/quiz`);

  return {
    success: true,
    quizResultId: insertedQuizResult.id,
    correctCards,
    totalCards: result.data.results.length,
  };
}

// ═══════════════════════════════════════════════════════════════════
// AI CARD GENERATION
// ═══════════════════════════════════════════════════════════════════

/** Max PDF size we allow (10 MB). */
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
  // Accept 'application/pdf' and also 'application/octet-stream' (some OSes/browsers
  // don't set the correct MIME type for PDFs). Fall back to checking the file name.
  const isPdf =
    file.type === 'application/pdf' ||
    file.type === 'application/octet-stream' ||
    file.name.toLowerCase().endsWith('.pdf');
  if (!isPdf) {
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
  } catch (err) {
    // Log the real error server-side so it's visible in Next.js terminal
    console.error('[generateCards] pdf-parse error:', err);
    return { error: 'Failed to read the PDF. It may be scanned-only, corrupted, or password-protected.' };
  }

  if (!extractedText || extractedText.trim().length < 50) {
    return { error: 'The PDF does not contain enough readable text (minimum ~50 characters).' };
  }

  // Truncate to stay within token limits
  const trimmedText = extractedText.slice(0, MAX_TEXT_CHARS);

  // ── 6. Call Gemini 2.0 Flash ──
  const model = getGeminiJsonModel();

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
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[generateCards] Gemini error:', msg);
    // Surface quota / rate-limit errors clearly instead of a generic message
    if (msg.includes('429') || msg.includes('quota') || msg.includes('Too Many Requests')) {
      return { error: 'Gemini free-tier quota exceeded for today. Enable billing at ai.google.dev or try again tomorrow.' };
    }
    return { error: `AI generation failed: ${msg}` };
  }

  // ── 7. Batch insert into the cards table ──
  const rows = cards.map((c) => ({
    deck_id: parsed.data.deck_id,
    front: c.front.slice(0, 1000),
    back: c.back.slice(0, 2000),
    source: 'ai_pdf' as const,
  }));

  const { data: insertedCards, error: insertErr } = await supabase
    .from('cards')
    .insert(rows)
    .select('id');
  if (insertErr) {
    return { error: 'Cards were generated but failed to save: ' + insertErr.message };
  }

  revalidatePath(`/dashboard/${parsed.data.deck_id}`);
  revalidatePath('/dashboard');

  return {
    success: true,
    count: cards.length,
    cardIds: (insertedCards ?? []).map((card) => card.id),
    cards: cards.map((c) => ({ front: c.front, back: c.back })),
  };
}

export async function sanitizeNotes(data: SanitizeNotesInput) {
  const result = sanitizeNotesSchema.safeParse(data);
  if (!result.success) {
    return { error: result.error.flatten().fieldErrors };
  }

  try {
    const model = getGeminiTextModel();
    const response = await model.generateContent({
      systemInstruction: [
        'You clean and reformat messy study notes.',
        'Rewrite the input into strict "Term - Description" format, one card per line.',
        'Do not invent information. Preserve the original meaning and wording as closely as possible.',
        'Return plain text only. No markdown, no numbering, no commentary.',
      ].join('\n'),
      contents: [{ role: 'user', parts: [{ text: result.data.raw_text }] }],
    });

    return { success: true, text: response.response.text().trim() };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[sanitizeNotes] Gemini error:', message);
    return { error: `AI cleaning failed: ${message}` };
  }
}

export async function getHint(data: GetHintInput) {
  const result = getHintSchema.safeParse(data);
  if (!result.success) {
    return { error: result.error.flatten().fieldErrors };
  }

  const deckAccess = await requireOwnedDeck(result.data.deck_id);
  if ('error' in deckAccess) {
    return { error: deckAccess.error };
  }

  const { supabase } = deckAccess;
  const { data: card, error } = await supabase
    .from('cards')
    .select('front, back')
    .eq('id', result.data.card_id)
    .eq('deck_id', result.data.deck_id)
    .single();

  if (error || !card) {
    return { error: 'Card not found.' };
  }

  try {
    const model = getGeminiTextModel();
    const response = await model.generateContent({
      systemInstruction: [
        'You generate hints for flashcard answers.',
        'Provide one short clue that helps the learner recall the answer without revealing the exact term.',
        'Do not use the exact answer word, close synonyms, acronyms, or the first letter.',
        'Return one sentence only.',
      ].join('\n'),
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Answer term: ${card.front}\nDescription/context: ${card.back}`,
            },
          ],
        },
      ],
    });

    return { success: true, hint: response.response.text().trim() };
  } catch (hintError) {
    const message = hintError instanceof Error ? hintError.message : String(hintError);
    console.error('[getHint] Gemini error:', message);
    return { error: `Hint generation failed: ${message}` };
  }
}
