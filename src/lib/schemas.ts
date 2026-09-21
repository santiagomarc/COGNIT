import {z} from "zod";
import { DECK_TAG_VALUES } from '@/lib/deck-tags';
import { countWords, maxWordsFor, responseText } from '@/lib/synthesis/text';

export const cardSourceSchema = z.enum(['manual', 'ai_pdf', 'bulk_import', 'ai_cleaned', 'synthesis_claim']);

/* ═══════════ Auth Schemas ═══════════ */

export const emailSchema = z
  .string()
  .min(1, { message: 'Email is required' })
  .email({ message: 'Please enter a valid email address' })
  .transform((v) => v.toLowerCase().trim());

export const passwordSchema = z
  .string()
  .min(8, { message: 'Password must be at least 8 characters' })
  .max(72, { message: 'Password must be less than 72 characters' }) // bcrypt limit
  .regex(/[a-z]/, { message: 'Password must contain a lowercase letter' })
  .regex(/[A-Z]/, { message: 'Password must contain an uppercase letter' })
  .regex(/[0-9]/, { message: 'Password must contain a number' });

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { message: 'Password is required' }),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export type SignupInput = z.infer<typeof signupSchema>;

export const resetPasswordSchema = z.object({
  email: emailSchema,
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const updatePasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string().min(1, { message: 'Please confirm your password' }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type UpdatePasswordInput = z.infer<typeof updatePasswordSchema>;

/* ═══════════ Deck & Card Schemas ═══════════ */

//properties of deck creation from the user
export const createDeckSchema = z.object({
    title: z.string().trim().min(3,{ message: "Title must be at least 3 characters long" }),
    accent_tag: z
      .string()
      .trim()
      .toLowerCase()
      .optional()
      .refine((value) => !value || DECK_TAG_VALUES.includes(value as (typeof DECK_TAG_VALUES)[number]), {
        message: 'Select a valid deck tag',
      }),
    description: z.string().max(500).optional(),
    is_public: z.boolean().default(false),
});

// infer the ts type from the zod schema
export type CreateDeckInput = z.infer<typeof createDeckSchema>;

//properties of card creation from the user
export const createCardSchema = z.object({
    deck_id: z.uuid({ message: "Invalid deck id" }),
    front: z.string().min(1, { message: "Question is required" }).max(1000),
    back: z.string().min(1, { message: "Answer is required" }).max(2000),
  source: cardSourceSchema.default('manual').optional(),
  imported_by: z.string().trim().max(200).optional(),
});

export type CreateCardInput = z.infer<typeof createCardSchema>;

// properties of card update from the user
export const updateCardSchema = z.object({
    id: z.uuid({ message: "Invalid card id" }),
    deck_id: z.uuid({ message: "Invalid deck id" }),
    front: z.string().min(1, { message: "Question is required" }).max(1000),
    back: z.string().min(1, { message: "Answer is required" }).max(2000),
});

export type UpdateCardInput = z.infer<typeof updateCardSchema>;

/* ═══════════ AI Generation Schema ═══════════ */

export const generateCardsSchema = z.object({
    deck_id: z.uuid({ message: "Invalid deck id" }),
  /** Maximum flashcards to generate. AI may return fewer when coverage is complete. */
    count: z.number().int().min(5).max(30).default(10),
});

export type GenerateCardsInput = z.infer<typeof generateCardsSchema>;

export const bulkImportSchema = z.object({
  deck_id: z.uuid({ message: "Invalid deck id" }),
  cards: z.array(
    z.object({
      front: z.string().min(1, { message: "Term is required" }).max(1000),
      back: z.string().min(1, { message: "Description is required" }).max(2000),
    })
  ).min(1, { message: "At least one card is required" }).max(200, { message: "You can import at most 200 cards at once" }),
  imported_by: z.string().trim().max(200).optional(),
});

export type BulkImportInput = z.infer<typeof bulkImportSchema>;

export const enrichCardsSchema = z.object({
  deck_id: z.uuid({ message: "Invalid deck id" }),
  card_ids: z.array(z.uuid({ message: "Invalid card id" })).min(1).max(200),
});

export type EnrichCardsInput = z.infer<typeof enrichCardsSchema>;

export const sanitizeNotesSchema = z.object({
  raw_text: z.string().trim().min(1, { message: "Notes are required" }).max(50_000, { message: "Notes are too long" }),
});

export type SanitizeNotesInput = z.infer<typeof sanitizeNotesSchema>;

export const getHintSchema = z.object({
  card_id: z.uuid({ message: "Invalid card id" }),
  deck_id: z.uuid({ message: "Invalid deck id" }),
});

export type GetHintInput = z.infer<typeof getHintSchema>;

export const generateMnemonicSchema = z.object({
  card_id: z.uuid({ message: 'Invalid card id' }),
  deck_id: z.uuid({ message: 'Invalid deck id' }),
});

export type GenerateMnemonicInput = z.infer<typeof generateMnemonicSchema>;

export const syncEmbeddingsSchema = z.object({
  deck_id: z.uuid({ message: 'Invalid deck id' }),
});

export type SyncEmbeddingsInput = z.infer<typeof syncEmbeddingsSchema>;

export const createDeckChatSessionSchema = z.object({
  deck_id: z.uuid({ message: 'Invalid deck id' }),
  title: z.string().trim().min(1).max(120).optional(),
});

export type CreateDeckChatSessionInput = z.infer<typeof createDeckChatSessionSchema>;

export const getDeckChatMessagesSchema = z.object({
  deck_id: z.uuid({ message: 'Invalid deck id' }),
  session_id: z.uuid({ message: 'Invalid session id' }),
  limit: z.number().int().min(1).max(100).default(50).optional(),
});

export type GetDeckChatMessagesInput = z.infer<typeof getDeckChatMessagesSchema>;

export const chatWithDeckSchema = z.object({
  deck_id: z.uuid({ message: 'Invalid deck id' }),
  session_id: z.uuid({ message: 'Invalid session id' }).optional(),
  message: z.string().trim().min(3, { message: 'Message is too short' }).max(2000, { message: 'Message is too long' }),
  top_k: z.number().int().min(1).max(10).default(5).optional(),
});

export type ChatWithDeckInput = z.infer<typeof chatWithDeckSchema>;

export const semanticSearchSchema = z.object({
  query: z.string().trim().min(3, { message: 'Search query is too short' }).max(300, { message: 'Search query is too long' }),
  limit: z.number().int().min(1).max(20).default(8).optional(),
});

export type SemanticSearchInput = z.infer<typeof semanticSearchSchema>;

/* ═══════════ Study / Grading Schema ═══════════ */

export const quizModeSchema = z.enum(['mcq', 'identification']);

export const gradeCardSchema = z.object({
    card_id: z.uuid({ message: "Invalid card id" }),
    deck_id: z.uuid({ message: "Invalid deck id" }),
    grade: z.enum(['again', 'hard', 'good', 'easy'], {
        message: "Grade must be again, hard, good, or easy",
    }),
    /** How long the user spent on this card (ms). 0 if not tracked. */
    duration_ms: z.number().int().min(0).default(0),
});

export type GradeCardInput = z.infer<typeof gradeCardSchema>;

export const logQuizResultSchema = z.object({
  deck_id: z.uuid({ message: 'Invalid deck id' }),
  mode: quizModeSchema,
  duration_ms: z.number().int().min(0).default(0),
  include_in_history: z.boolean().default(true),
  results: z.array(
    z.object({
      card_id: z.uuid({ message: 'Invalid card id' }),
      user_answer: z.string().trim().max(1000).default(''),
    })
  ).min(1, { message: 'At least one quiz result is required' }).max(200, { message: 'Too many quiz results provided' }),
});

export type LogQuizResultInput = z.infer<typeof logQuizResultSchema>;

/* ═══════════ Micro-synthesis (COGNIT_MICRO_SYNTHESIS_SPEC.md §9.1) ═══════════ */

export const synthesisFormatSchema = z.enum(['causal', 'counterfactual', 'comparative', 'evaluate', 'apply', 'distinguish', 'elaborate']);

export const generateSynthesisDrillsSchema = z.object({
  deck_id: z.uuid({ message: 'Invalid deck id' }),
  count: z.number().int().min(1).max(5).default(3),
  formats: z.array(synthesisFormatSchema).min(1).max(7).default(['causal', 'counterfactual', 'comparative']),
  /** Restrict clustering to one topic tag; omitted = whole deck. */
  focus_topic: z.string().trim().min(2).max(80).optional(),
});

/** Input shape: defaults (`count`, `formats`) are optional for callers. */
export type GenerateSynthesisDrillsInput = z.input<typeof generateSynthesisDrillsSchema>;

const synthesisOutlineResponseSchema = z.object({
  claim: z.string().trim().min(1, { message: 'State your claim' }).max(200),
  mechanisms: z.tuple([z.string().trim().max(220), z.string().trim().max(220)]),
  tradeoff: z.string().trim().max(220),
  /** The optional evidence slot (plan D12). */
  evidence: z.string().trim().max(220).optional(),
});

const synthesisFreeResponseSchema = z.object({
  text: z.string().trim().min(1, { message: 'Write an answer' }).max(1_500),
});

const synthesisPlanPointSchema = z.object({
  claim: z.string().trim().max(220),
  mechanism: z.string().trim().max(300),
  evidence: z.string().trim().max(220),
  limit: z.string().trim().max(220),
});

/** An essay plan (plan D15): thesis, three points, conclusion. Only the thesis is required to submit. */
const synthesisPlanResponseSchema = z.object({
  thesis: z.string().trim().min(1, { message: 'State your thesis' }).max(300),
  points: z.tuple([synthesisPlanPointSchema, synthesisPlanPointSchema, synthesisPlanPointSchema]),
  conclusion: z.string().trim().max(300),
});

export const checkSynthesisAttemptSchema = z.object({
  deck_id: z.uuid({ message: 'Invalid deck id' }),
  drill_id: z.uuid({ message: 'Invalid drill id' }),
  mode: z.enum(['outline', 'free', 'plan']),
  response: z.union([synthesisOutlineResponseSchema, synthesisFreeResponseSchema, synthesisPlanResponseSchema]),
  duration_ms: z.number().int().min(0).default(0),
  /** Pull contradicted cards forward to tomorrow's queue (spec §8.4). */
  pull_forward: z.boolean().default(true),
  /** Judgement of learning before the check: 1 unsure · 2 fairly sure · 3 sure (audit F1). */
  confidence: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  /**
   * Client-generated key for this check. A retry after an ambiguous failure
   * sends the same key and gets the existing attempt back instead of a
   * second model call (audit R8).
   */
  client_attempt_id: z.uuid({ message: 'Invalid attempt key' }).optional(),
  /** The attempt this one revises — the one in-place revise after a partial or contradicted verdict (audit F2). */
  revision_of: z.uuid({ message: 'Invalid attempt id' }).optional(),
  /** Which wording the student answered: 0 = the original, 1–2 = a variant (plan D6). */
  prompt_variant: z.number().int().min(0).max(2).default(0),
  /** The exemplar was shown before answering (the deck's first drill, plan D14); recorded, never graded differently. */
  worked_example: z.boolean().default(false),
}).superRefine((value, ctx) => {
  const shape = 'thesis' in value.response ? 'plan' : 'claim' in value.response ? 'outline' : 'free';
  if (shape !== value.mode) {
    ctx.addIssue({ code: 'custom', path: ['mode'], message: 'Mode does not match the answer shape' });
  }
  const limit = maxWordsFor(value.mode);
  if (countWords(responseText(value.response)) > limit) {
    ctx.addIssue({ code: 'custom', path: ['response'], message: `Keep it under ${limit} words` });
  }
});

export type CheckSynthesisAttemptInput = z.input<typeof checkSynthesisAttemptSchema>;

export const archiveSynthesisDrillSchema = z.object({
  deck_id: z.uuid({ message: 'Invalid deck id' }),
  drill_id: z.uuid({ message: 'Invalid drill id' }),
});

export type ArchiveSynthesisDrillInput = z.infer<typeof archiveSynthesisDrillSchema>;

/** A plan question over 4–8 cards of one topic (plan D15); from a pasted question when `question_id` is given (D16). */
export const generatePlanQuestionsSchema = z.object({
  deck_id: z.uuid({ message: 'Invalid deck id' }),
  count: z.number().int().min(1).max(3).default(1),
  focus_topic: z.string().trim().min(2).max(80).optional(),
  question_id: z.uuid({ message: 'Invalid question id' }).optional(),
});
export type GeneratePlanQuestionsInput = z.input<typeof generatePlanQuestionsSchema>;

/** Past-paper questions, pasted one per line (plan D16). */
export const ingestQuestionsSchema = z.object({
  deck_id: z.uuid({ message: 'Invalid deck id' }),
  questions: z.array(z.string().trim().min(10, { message: 'A question needs at least ten characters' }).max(600)).min(1).max(20),
});
export type IngestQuestionsInput = z.infer<typeof ingestQuestionsSchema>;

export const deleteQuestionSchema = z.object({
  deck_id: z.uuid({ message: 'Invalid deck id' }),
  question_id: z.uuid({ message: 'Invalid question id' }),
});
export type DeleteQuestionInput = z.infer<typeof deleteQuestionSchema>;

/** The deck's exam date as an ISO date-time, or null to clear it (plan D19). */
export const setExamDateSchema = z.object({
  deck_id: z.uuid({ message: 'Invalid deck id' }),
  exam_at: z.iso.datetime({ offset: true, message: 'Invalid date' }).nullable(),
});
export type SetExamDateInput = z.infer<typeof setExamDateSchema>;

export const rateSynthesisAttemptSchema = z.object({
  deck_id: z.uuid({ message: 'Invalid deck id' }),
  attempt_id: z.uuid({ message: 'Invalid attempt id' }),
  rating: z.enum(['fair', 'unfair']),
  note: z.string().trim().max(300).optional(),
});

export type RateSynthesisAttemptInput = z.infer<typeof rateSynthesisAttemptSchema>;

/**
 * "+ Add as card" from a drill result (improvement plan §3.3). The claim is
 * identified by the attempt it was made in and its index in that attempt's
 * outside_claims (0–2, spec §7.3), so a second tap finds the first card.
 */
export const absorbOutsideClaimSchema = z.object({
  deck_id: z.uuid({ message: 'Invalid deck id' }),
  attempt_id: z.uuid({ message: 'Invalid attempt id' }),
  claim_index: z.number().int().min(0).max(2),
  front: z.string().trim().min(1, { message: 'Term is required' }).max(1000),
  back: z.string().trim().min(1, { message: 'Description is required' }).max(2000),
});
export type AbsorbOutsideClaimInput = z.infer<typeof absorbOutsideClaimSchema>;
