import {z} from "zod";

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

