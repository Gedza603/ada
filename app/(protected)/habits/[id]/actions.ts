"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { updateHabit, deleteHabit } from "@/lib/data/habits";
import { toggleCompletion } from "@/lib/data/completions";
import { habitInputSchema, completionInputSchema } from "@/lib/validation/schemas";
import type { HabitFormState } from "@/components/habits/habit-form";

const idSchema = z.string().uuid();

export async function updateHabitAction(
  habitId: string,
  prevState: HabitFormState,
  formData: FormData,
): Promise<HabitFormState> {
  const parsedId = idSchema.safeParse(habitId);
  if (!parsedId.success) {
    return { error: "Invalid habit.", successToken: prevState.successToken };
  }

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

  // updateHabit() filters by user_id AND is enforced by the habits_update_own
  // RLS policy; a ownerless/foreign habitId simply updates zero rows.
  const updated = await updateHabit(parsedId.data, parsed.data);
  if (!updated) {
    return { error: "Habit not found.", successToken: prevState.successToken };
  }

  revalidatePath(`/habits/${parsedId.data}`);
  revalidatePath("/dashboard");
  return { error: null, successToken: prevState.successToken + 1 };
}

export async function deleteHabitAndRedirectAction(habitId: string): Promise<void> {
  const parsed = idSchema.safeParse(habitId);
  if (!parsed.success) return;

  await deleteHabit(parsed.data);
  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function toggleCompletionOnDetailAction(habitId: string, date: string): Promise<void> {
  const parsed = completionInputSchema.safeParse({ habitId, date });
  if (!parsed.success) return;

  await toggleCompletion(parsed.data.habitId, parsed.data.date);
  revalidatePath(`/habits/${parsed.data.habitId}`);
  revalidatePath("/dashboard");
}
