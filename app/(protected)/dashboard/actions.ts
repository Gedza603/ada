"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createHabit, deleteHabit } from "@/lib/data/habits";
import { toggleCompletion } from "@/lib/data/completions";
import { habitInputSchema, completionInputSchema } from "@/lib/validation/schemas";
import type { HabitFormState } from "@/components/habits/habit-form";

const idSchema = z.string().uuid();

// `requireUser()` runs inside every lib/data/* function these actions call,
// and ownership is enforced again by RLS on every query — never by trusting
// an id the client happened to send. See ARCHITECTURE.md §1.3, §5 (#2).

export async function createHabitAction(
  prevState: HabitFormState,
  formData: FormData,
): Promise<HabitFormState> {
  const parsed = habitInputSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    color: formData.get("color") || undefined,
    category: formData.get("category"),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Please check the form.",
      successToken: prevState.successToken,
    };
  }

  await createHabit(parsed.data);
  revalidatePath("/dashboard");
  return { error: null, successToken: prevState.successToken + 1 };
}

export async function deleteHabitAction(habitId: string): Promise<void> {
  const parsed = idSchema.safeParse(habitId);
  if (!parsed.success) return;

  await deleteHabit(parsed.data);
  revalidatePath("/dashboard");
}

export async function toggleCompletionAction(habitId: string, date: string): Promise<void> {
  const parsed = completionInputSchema.safeParse({ habitId, date });
  if (!parsed.success) return;

  await toggleCompletion(parsed.data.habitId, parsed.data.date);
  revalidatePath("/dashboard");
  revalidatePath(`/habits/${parsed.data.habitId}`);
}
