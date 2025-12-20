export type CardState = 'new' | 'learning' | 'review' | 'relearning';

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