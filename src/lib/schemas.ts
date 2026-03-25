import {z} from "zod";

export const cardSourceSchema = z.enum(['manual', 'ai_pdf', 'bulk_import', 'ai_cleaned']);

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
    title: z.string().min(3,{ message: "Title must be at least 3 characters long" }),
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
    /** Number of flashcards to generate. 5-30 range keeps cost sane. */
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
  results: z.array(
    z.object({
      card_id: z.uuid({ message: 'Invalid card id' }),
      user_answer: z.string().trim().max(1000).default(''),
    })
  ).min(1, { message: 'At least one quiz result is required' }).max(200, { message: 'Too many quiz results provided' }),
});

export type LogQuizResultInput = z.infer<typeof logQuizResultSchema>;

