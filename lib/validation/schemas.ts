import { z } from "zod";

export const emailSchema = z.string().trim().toLowerCase().email().max(255);
export const passwordSchema = z.string().min(10, "Password must be at least 10 characters").max(200);

export const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(1).max(80).optional(),
});
export type SignUpInput = z.infer<typeof signUpSchema>;

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
});
export type SignInInput = z.infer<typeof signInSchema>;

// Intentionally has no `user_id` / `id` field: ownership is never accepted
// from the client. See ARCHITECTURE.md §5, vulnerability #2.
export const habitInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  description: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : undefined)),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Must be a hex color like #4F46E5")
    .default("#4F46E5"),
  category: z
    .string()
    .trim()
    .max(40)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : undefined)),
});
export type HabitInput = z.infer<typeof habitInputSchema>;

export const completionInputSchema = z.object({
  habitId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
});
export type CompletionInput = z.infer<typeof completionInputSchema>;
