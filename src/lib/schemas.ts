import {z} from "zod";

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

