'use server';

import { logQuizResultSchema, LogQuizResultInput } from '@/lib/schemas';
import { revalidatePath } from 'next/cache';
import { sm2, DEFAULT_EASE_FACTOR } from '@/lib/sm2';
import { similarity } from '@/lib/fuzzy';
import type { CardState, QuizHistoryEntry, QuizMode } from '@/index';
import { isMissingDatabaseFunctionError } from '@/lib/supabase-errors';
import { sanitizeDatabaseError } from '@/lib/server-errors';
import { normalizeForMatch, requireOwnedDeck } from './_shared';
import { logger } from '@/lib/logger';

export async function logQuizResult(data: LogQuizResultInput) {
  const result = logQuizResultSchema.safeParse(data);
  if (!result.success) {
    return { error: result.error.flatten().fieldErrors };
  }

  const deckAccess = await requireOwnedDeck(result.data.deck_id);
  if ('error' in deckAccess) {
    return { error: deckAccess.error };
  }

  const { supabase } = deckAccess;
  const uniqueCardIds = [...new Set(result.data.results.map((entry) => entry.card_id))];
  const { data: ownedCards, error: ownedCardsError } = await supabase
    .from('cards')
    .select('id, front, back, id_question, mcq_distractors, state, interval, ease_factor, repetition_count')
    .eq('deck_id', result.data.deck_id)
    .in('id', uniqueCardIds);

  if (ownedCardsError) {
    logger.error('logQuizResult', 'owned cards fetch error', { code: ownedCardsError.code, message: ownedCardsError.message });
    return { error: sanitizeDatabaseError(ownedCardsError, 'Failed to validate quiz cards.') };
  }

  const cardsById = new Map((ownedCards ?? []).map((card) => [card.id, card]));
  const ownedCardIds = new Set(cardsById.keys());
  if (ownedCardIds.size !== uniqueCardIds.length) {
    return { error: 'One or more quiz results referenced cards outside this deck.' };
  }

  const evaluatedResults = result.data.results.map((entry) => {
    const card = cardsById.get(entry.card_id);
    if (!card) {
      return null;
    }

    const userAnswer = entry.user_answer;
    const correct = result.data.mode === 'identification'
      ? similarity(userAnswer, card.front) >= 0.7
      : normalizeForMatch(userAnswer) === normalizeForMatch(card.front);

    return {
      card_id: entry.card_id,
      correct,
      prompt_text: card.id_question ?? card.back,
      correct_answer_text: card.front,
      user_answer_text: userAnswer,
    };
  }).filter((entry): entry is {
    card_id: string;
    correct: boolean;
    prompt_text: string;
    correct_answer_text: string;
    user_answer_text: string;
  } => entry !== null);

  if (evaluatedResults.length !== result.data.results.length) {
    return { error: 'Failed to evaluate one or more quiz answers.' };
  }

  // ── SM-2: Update card scheduling from quiz outcomes ─────────────────────
  // Map quiz correctness to SM-2 grades: correct → 4 (Good), incorrect → 0 (Again)
  const sm2Updates = evaluatedResults.map((entry) => {
    const card = cardsById.get(entry.card_id);
    const grade = entry.correct ? 4 : 0;
    const sm2Result = sm2(grade as Parameters<typeof sm2>[0], {
      repetitionCount: card?.repetition_count ?? 0,
      easeFactor: card?.ease_factor ?? DEFAULT_EASE_FACTOR,
      interval: card?.interval ?? 0,
      state: (card?.state as CardState) ?? 'new',
    });
    return {
      card_id: entry.card_id,
      sm2Result,
      grade,
      correct: entry.correct,
    };
  });

  const correctCards = evaluatedResults.filter((entry) => entry.correct).length;

  // One transaction: every card's schedule, its study_logs row, its mastery
  // state, the quiz_results row and its quiz_card_results. The history tables
  // are append-only, so a partial write used to be permanent.
  const { data: logged, error: logError } = await supabase.rpc('log_quiz_result', {
    p_deck_id: result.data.deck_id,
    p_mode: result.data.mode,
    p_duration_ms: result.data.duration_ms,
    p_include_in_history: result.data.include_in_history,
    p_updates: sm2Updates.map(({ card_id, sm2Result, grade, correct }) => ({
      card_id,
      state: sm2Result.state,
      interval: sm2Result.interval,
      ease_factor: sm2Result.easeFactor,
      repetition_count: sm2Result.repetitionCount,
      next_review_at: sm2Result.nextReviewAt.toISOString(),
      grade,
      correct,
    })),
    p_card_results: evaluatedResults,
  });

  const insertedQuizResult = logged?.[0];
  if (logError || !insertedQuizResult) {
    logger.error('logQuizResult', 'log_quiz_result rpc failed', { code: logError?.code, message: logError?.message });
    return { error: sanitizeDatabaseError(logError, 'Failed to save quiz result.') };
  }

  revalidatePath('/dashboard');
  revalidatePath(`/dashboard/${result.data.deck_id}`);

  return {
    success: true,
    quizResultId: insertedQuizResult.quiz_result_id,
    correctCards,
    totalCards: evaluatedResults.length,
  };
}

// Not exported: a 'use server' module may only export async functions (invariant #2).
const QUIZ_HISTORY_PAGE_SIZE = 20;

type QuizHistoryMissRow = {
  card_id?: unknown;
  prompt?: unknown;
  correct_answer?: unknown;
  user_answer?: unknown;
};

/**
 * One page of quiz history, newest first, with each quiz's misses already
 * nested by the database. `before` is the `created_at` of the last row the
 * client holds; `hasMore` says whether to offer another page.
 */
export async function getQuizHistory(deckId: string, options: { before?: string | null; limit?: number } = {}) {
  const deckAccess = await requireOwnedDeck(deckId);
  if ('error' in deckAccess) {
    return { error: deckAccess.error };
  }

  const { supabase } = deckAccess;
  const limit = Math.min(Math.max(1, options.limit ?? QUIZ_HISTORY_PAGE_SIZE), 50);

  const { data, error } = await supabase.rpc('get_quiz_history', {
    p_deck_id: deckId,
    p_limit: limit + 1,           // one extra row answers "is there another page?"
    p_before: options.before ?? null,
  });

  if (error) {
    logger.error('getQuizHistory', 'get_quiz_history rpc failed', { code: error.code, message: error.message });
    return { error: 'Failed to fetch quiz history.' };
  }

  const rows = data ?? [];
  const page = rows.slice(0, limit);

  const history: QuizHistoryEntry[] = page.map((row) => {
    const misses = Array.isArray(row.misses) ? (row.misses as QuizHistoryMissRow[]) : [];
    const incorrectAnswers = misses.map((miss) => ({
      card_id: typeof miss.card_id === 'string' ? miss.card_id : '',
      card_number: null,
      prompt: typeof miss.prompt === 'string' && miss.prompt ? miss.prompt : 'Card content unavailable',
      correct_answer: typeof miss.correct_answer === 'string' && miss.correct_answer ? miss.correct_answer : 'Card term unavailable',
      user_answer: typeof miss.user_answer === 'string' && miss.user_answer.trim().length > 0 ? miss.user_answer : null,
    }));

    const totalCards = row.total_cards > 0 ? row.total_cards : 1;

    return {
      id: row.id,
      deck_id: deckId,
      // The `mode` CHECK constraint guarantees this is 'mcq' | 'identification';
      // Postgres reports the column type as plain text.
      mode: row.mode as QuizMode,
      total_cards: row.total_cards,
      correct_cards: row.correct_cards,
      score_percentage: Math.round((row.correct_cards / totalCards) * 100),
      wrong_count: incorrectAnswers.length,
      duration_ms: row.duration_ms,
      created_at: row.created_at,
      incorrect_answers: incorrectAnswers,
    };
  });

  return { history, hasMore: rows.length > limit };
}

export type WeakestConcept = {
  topic_tag: string;
  attempts: number;
  misses: number;
  error_rate: number;
};

export async function getWeakestConcepts(deckId: string, limit = 8) {
  const deckAccess = await requireOwnedDeck(deckId);
  if ('error' in deckAccess) {
    return { error: deckAccess.error };
  }

  const { supabase, user } = deckAccess;

  const { data, error } = await supabase.rpc('get_weakest_concepts', {
    p_user_id: user.id,
    p_deck_id: deckId,
    p_limit: limit,
  });

  if (error) {
    if (isMissingDatabaseFunctionError(error.message, 'get_weakest_concepts')) {
      // Migration not applied yet — an empty list degrades gracefully to the
      // "not enough quiz history" empty state rather than an error.
      return { concepts: [] as WeakestConcept[] };
    }
    return { error: sanitizeDatabaseError(error, 'Failed to load weakest concepts.') };
  }

  return { concepts: (data ?? []) as WeakestConcept[] };
}
