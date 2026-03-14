export type CardState = 'new' | 'learning' | 'review' | 'relearning';
export type CardSource = 'manual' | 'ai_pdf' | 'bulk_import' | 'ai_cleaned';

export interface Deck {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface Card {
  id: string;
  deck_id: string;
  front: string;
  back: string;
  explanation: string | null;
  source: CardSource;
  imported_by: string | null;
  mcq_distractors: string[] | null;
  id_question: string | null;
  
  // Spaced Repetition Data
  state: CardState;
  next_review_at: string; // ISO Date string
  last_review_at: string | null;
  interval: number;
  ease_factor: number;
  repetition_count: number;
  
  created_at: string;
}

export interface StudyLog {
  id: string;
  user_id: string;
  card_id: string;
  grade: number; // 0-5
  review_duration_ms: number;
  created_at: string;
}

export interface QuizResult {
  id: string;
  user_id: string;
  deck_id: string;
  mode: 'mcq' | 'identification';
  total_cards: number;
  correct_cards: number;
  duration_ms: number;
  created_at: string;
}

export interface QuizCardResult {
  id: string;
  quiz_result_id: string;
  card_id: string;
  correct: boolean;
  prompt_text: string | null;
  correct_answer_text: string | null;
  user_answer_text: string | null;
  created_at: string;
}

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
  mode: 'mcq' | 'identification';
  total_cards: number;
  correct_cards: number;
  score_percentage: number;
  wrong_count: number;
  duration_ms: number;
  created_at: string;
  incorrect_answers: QuizHistoryMistake[];
}