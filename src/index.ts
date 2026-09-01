import type { Database } from '@/lib/database.types';

type Tables = Database['public']['Tables'];

export type CardState = Database['public']['Enums']['card_state'];
export type CardSource = 'manual' | 'ai_pdf' | 'bulk_import' | 'ai_cleaned';
export type QuizMode = 'mcq' | 'identification';

export type DeckRow = Tables['decks']['Row'];
export type CardRow = Tables['cards']['Row'];
export type StudyLogRow = Tables['study_logs']['Row'];
export type QuizResultRow = Tables['quiz_results']['Row'];
export type QuizCardResultRow = Tables['quiz_card_results']['Row'];

export interface Deck extends Omit<DeckRow, 'is_public' | 'created_at' | 'updated_at'> {
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface Card extends Omit<CardRow, 'source' | 'state' | 'next_review_at' | 'created_at'> {
  source: CardSource;
  // pgvector columns round-trip through PostgREST as a "[0.1,0.2,...]" string literal, not number[].
  state: CardState;
  next_review_at: string; // ISO Date string
  created_at: string;
}

export interface StudyLog extends Omit<StudyLogRow, 'created_at' | 'review_duration_ms'> {
  grade: number; // 0-5
  review_duration_ms: number;
  created_at: string;
}

export interface QuizResult extends Omit<QuizResultRow, 'mode' | 'created_at'> {
  mode: QuizMode;
  created_at: string;
}

export type QuizCardResult = QuizCardResultRow;

export interface QuizHistoryMistake {
  card_id: string;
  card_number: number | null;
  prompt: string;
  correct_answer: string;
  user_answer: string | null;
}

export interface QuizHistoryEntry {
  id: string;
  deck_id: string;
  mode: QuizMode;
  total_cards: number;
  correct_cards: number;
  score_percentage: number;
  wrong_count: number;
  duration_ms: number;
  created_at: string;
  incorrect_answers: QuizHistoryMistake[];
}
