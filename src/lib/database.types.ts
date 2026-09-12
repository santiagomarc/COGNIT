export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_usage_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          metadata: Json
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          metadata?: Json
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          metadata?: Json
          user_id?: string
        }
        Relationships: []
      }
      card_mastery_state: {
        Row: {
          card_id: string
          correct: boolean
          deck_id: string
          last_quiz_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          card_id: string
          correct: boolean
          deck_id: string
          last_quiz_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          card_id?: string
          correct?: boolean
          deck_id?: string
          last_quiz_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_mastery_state_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_mastery_state_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
        ]
      }
      cards: {
        Row: {
          ai_hint: string | null
          back: string
          created_at: string | null
          deck_id: string
          ease_factor: number | null
          embedding: string | null
          explanation: string | null
          front: string
          id: string
          id_question: string | null
          imported_by: string | null
          interval: number | null
          last_review_at: string | null
          mcq_distractors: string[] | null
          mnemonic: string | null
          next_review_at: string | null
          repetition_count: number | null
          source: string
          state: Database["public"]["Enums"]["card_state"] | null
          topic_tags: string[] | null
        }
        Insert: {
          ai_hint?: string | null
          back: string
          created_at?: string | null
          deck_id: string
          ease_factor?: number | null
          embedding?: string | null
          explanation?: string | null
          front: string
          id?: string
          id_question?: string | null
          imported_by?: string | null
          interval?: number | null
          last_review_at?: string | null
          mcq_distractors?: string[] | null
          mnemonic?: string | null
          next_review_at?: string | null
          repetition_count?: number | null
          source?: string
          state?: Database["public"]["Enums"]["card_state"] | null
          topic_tags?: string[] | null
        }
        Update: {
          ai_hint?: string | null
          back?: string
          created_at?: string | null
          deck_id?: string
          ease_factor?: number | null
          embedding?: string | null
          explanation?: string | null
          front?: string
          id?: string
          id_question?: string | null
          imported_by?: string | null
          interval?: number | null
          last_review_at?: string | null
          mcq_distractors?: string[] | null
          mnemonic?: string | null
          next_review_at?: string | null
          repetition_count?: number | null
          source?: string
          state?: Database["public"]["Enums"]["card_state"] | null
          topic_tags?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "cards_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
        ]
      }
      deck_chat_embedding_metadata: {
        Row: {
          created_at: string
          deck_id: string
          embedded_cards: number
          id: string
          last_sync_at: string | null
          sync_error_message: string | null
          total_cards: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deck_id: string
          embedded_cards?: number
          id?: string
          last_sync_at?: string | null
          sync_error_message?: string | null
          total_cards?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deck_id?: string
          embedded_cards?: number
          id?: string
          last_sync_at?: string | null
          sync_error_message?: string | null
          total_cards?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deck_chat_embedding_metadata_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
        ]
      }
      deck_chat_messages: {
        Row: {
          content: string
          created_at: string
          deck_id: string
          followup_suggestions: string[]
          id: string
          referenced_card_ids: string[]
          role: string
          session_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          deck_id: string
          followup_suggestions?: string[]
          id?: string
          referenced_card_ids?: string[]
          role: string
          session_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          deck_id?: string
          followup_suggestions?: string[]
          id?: string
          referenced_card_ids?: string[]
          role?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deck_chat_messages_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deck_chat_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "deck_chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      deck_chat_sessions: {
        Row: {
          created_at: string
          deck_id: string
          id: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deck_id: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deck_id?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deck_chat_sessions_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
        ]
      }
      decks: {
        Row: {
          clone_count: number
          created_at: string | null
          description: string | null
          id: string
          is_public: boolean | null
          share_token: string | null
          shared_at: string | null
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          clone_count?: number
          created_at?: string | null
          description?: string | null
          id?: string
          is_public?: boolean | null
          share_token?: string | null
          shared_at?: string | null
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          clone_count?: number
          created_at?: string | null
          description?: string | null
          id?: string
          is_public?: boolean | null
          share_token?: string | null
          shared_at?: string | null
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      quiz_card_results: {
        Row: {
          card_id: string
          correct: boolean
          correct_answer_text: string | null
          created_at: string
          id: string
          prompt_text: string | null
          quiz_result_id: string
          user_answer_text: string | null
        }
        Insert: {
          card_id: string
          correct: boolean
          correct_answer_text?: string | null
          created_at?: string
          id?: string
          prompt_text?: string | null
          quiz_result_id: string
          user_answer_text?: string | null
        }
        Update: {
          card_id?: string
          correct?: boolean
          correct_answer_text?: string | null
          created_at?: string
          id?: string
          prompt_text?: string | null
          quiz_result_id?: string
          user_answer_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quiz_card_results_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_card_results_quiz_result_id_fkey"
            columns: ["quiz_result_id"]
            isOneToOne: false
            referencedRelation: "quiz_results"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_results: {
        Row: {
          correct_cards: number
          created_at: string
          deck_id: string
          duration_ms: number
          id: string
          include_in_history: boolean
          incorrect_answers: Json | null
          mode: string
          total_cards: number
          user_id: string
        }
        Insert: {
          correct_cards: number
          created_at?: string
          deck_id: string
          duration_ms?: number
          id?: string
          include_in_history?: boolean
          incorrect_answers?: Json | null
          mode: string
          total_cards: number
          user_id: string
        }
        Update: {
          correct_cards?: number
          created_at?: string
          deck_id?: string
          duration_ms?: number
          id?: string
          include_in_history?: boolean
          incorrect_answers?: Json | null
          mode?: string
          total_cards?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_results_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
        ]
      }
      study_logs: {
        Row: {
          card_id: string
          created_at: string | null
          grade: number
          id: string
          review_duration_ms: number | null
          user_id: string
        }
        Insert: {
          card_id: string
          created_at?: string | null
          grade: number
          id?: string
          review_duration_ms?: number | null
          user_id: string
        }
        Update: {
          card_id?: string
          created_at?: string | null
          grade?: number
          id?: string
          review_duration_ms?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_logs_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
        ]
      }
      synthesis_attempts: {
        Row: {
          contradicted_card_ids: string[]
          contradictions: Json
          coverage: Json
          created_at: string
          deck_id: string
          drill_id: string
          duration_ms: number
          gap_note: string
          id: string
          integrity: Json
          missing_card_ids: string[]
          mode: string
          model: string
          outside_claims: Json
          pulled_forward_card_ids: string[]
          response: Json
          structure: Json
          usage: Json
          user_id: string
          verdict: string
          word_count: number
        }
        Insert: {
          contradicted_card_ids?: string[]
          contradictions?: Json
          coverage?: Json
          created_at?: string
          deck_id: string
          drill_id: string
          duration_ms?: number
          gap_note?: string
          id?: string
          integrity?: Json
          missing_card_ids?: string[]
          mode: string
          model: string
          outside_claims?: Json
          pulled_forward_card_ids?: string[]
          response: Json
          structure?: Json
          usage?: Json
          user_id: string
          verdict: string
          word_count: number
        }
        Update: {
          contradicted_card_ids?: string[]
          contradictions?: Json
          coverage?: Json
          created_at?: string
          deck_id?: string
          drill_id?: string
          duration_ms?: number
          gap_note?: string
          id?: string
          integrity?: Json
          missing_card_ids?: string[]
          mode?: string
          model?: string
          outside_claims?: Json
          pulled_forward_card_ids?: string[]
          response?: Json
          structure?: Json
          usage?: Json
          user_id?: string
          verdict?: string
          word_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "synthesis_attempts_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "synthesis_attempts_drill_id_fkey"
            columns: ["drill_id"]
            isOneToOne: false
            referencedRelation: "synthesis_drills"
            referencedColumns: ["id"]
          },
        ]
      }
      synthesis_drills: {
        Row: {
          attempt_count: number
          card_ids: string[]
          created_at: string
          deck_id: string
          exemplar: Json
          format: string
          generation_meta: Json
          id: string
          last_attempt_at: string | null
          last_verdict: string | null
          next_due_at: string
          prompt_text: string
          required_links: Json
          status: string
          step: number
          topic_tag: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          attempt_count?: number
          card_ids: string[]
          created_at?: string
          deck_id: string
          exemplar: Json
          format: string
          generation_meta?: Json
          id?: string
          last_attempt_at?: string | null
          last_verdict?: string | null
          next_due_at?: string
          prompt_text: string
          required_links: Json
          status?: string
          step?: number
          topic_tag?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          attempt_count?: number
          card_ids?: string[]
          created_at?: string
          deck_id?: string
          exemplar?: Json
          format?: string
          generation_meta?: Json
          id?: string
          last_attempt_at?: string | null
          last_verdict?: string | null
          next_due_at?: string
          prompt_text?: string
          required_links?: Json
          status?: string
          step?: number
          topic_tag?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "synthesis_drills_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_card_embeddings_batch: {
        Args: { p_deck_id: string; p_updates: Json }
        Returns: number
      }
      apply_quiz_sm2_batch: {
        Args: { p_deck_id: string; p_updates: Json }
        Returns: number
      }
      batch_grade_owned_cards:
        | { Args: { p_deck_id: string; p_updates: Json[] }; Returns: undefined }
        | {
            Args: { p_deck_id: string; p_updates: Json[]; p_user_id: string }
            Returns: undefined
          }
      clone_shared_deck: { Args: { p_share_token: string }; Returns: string }
      count_quiz_ready_cards: { Args: { p_deck_id: string }; Returns: number }
      delete_owned_cards_batch: {
        Args: { p_card_ids: string[]; p_deck_id: string }
        Returns: number
      }
      get_deck_mastery_summary: {
        Args: { p_user_id: string }
        Returns: {
          assessed_cards: number
          deck_id: string
          last_quiz_at: string
          mastered_cards: number
        }[]
      }
      get_deck_topic_tag_counts: {
        Args: { p_deck_id: string; p_limit?: number }
        Returns: {
          tag_count: number
          topic_tag: string
        }[]
      }
      get_due_cards_by_deck: {
        Args: { p_now?: string; p_user_id: string }
        Returns: {
          deck_id: string
          due_count: number
        }[]
      }
      get_legacy_mastery_snapshots: {
        Args: { p_deck_ids?: string[] }
        Returns: {
          assessed_cards: number
          deck_id: string
          last_quiz_at: string
          mastered_cards: number
        }[]
      }
      get_study_activity_days: {
        Args: { p_user_id: string }
        Returns: {
          activity_date: string
          review_count: number
        }[]
      }
      get_weakest_concepts: {
        Args: {
          p_deck_id?: string
          p_limit?: number
          p_min_attempts?: number
          p_user_id: string
        }
        Returns: {
          attempts: number
          error_rate: number
          misses: number
          topic_tag: string
        }[]
      }
      grade_owned_card: {
        Args: {
          p_card_id: string
          p_deck_id: string
          p_ease_factor: number
          p_grade: number
          p_interval: number
          p_last_review_at: string
          p_next_review_at: string
          p_repetition_count: number
          p_review_duration_ms: number
          p_state: string
        }
        Returns: undefined
      }
      reserve_ai_call: {
        Args: {
          p_action: string
          p_max_requests: number
          p_metadata?: Json
          p_window_minutes: number
        }
        Returns: string
      }
      search_deck_cards_by_embedding: {
        Args: { p_deck_id: string; p_limit?: number; p_query_embedding: string }
        Returns: {
          back: string
          front: string
          id: string
          similarity: number
        }[]
      }
      search_user_cards_by_embedding: {
        Args: { p_limit?: number; p_query_embedding: string; p_user_id: string }
        Returns: {
          back: string
          deck_id: string
          deck_title: string
          front: string
          id: string
          similarity: number
        }[]
      }
      select_quiz_cards: {
        Args: {
          p_deck_id: string
          p_focus_unproven?: boolean
          p_limit?: number
        }
        Returns: {
          back: string
          deck_id: string
          ease_factor: number
          front: string
          id: string
          id_question: string
          interval: number
          mcq_distractors: Json
          mnemonic: string
          next_review_at: string
          repetition_count: number
          state: string
          topic_tags: Json
        }[]
      }
      set_deck_sharing: {
        Args: { p_deck_id: string; p_enabled: boolean; p_rotate?: boolean }
        Returns: string
      }
    }
    Enums: {
      card_state: "new" | "learning" | "review" | "relearning"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      card_state: ["new", "learning", "review", "relearning"],
    },
  },
} as const
