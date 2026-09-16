import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/require-user";

export type Completion = {
  id: string;
  habitId: string;
  completedDate: string;
};

type CompletionRow = { id: string; habit_id: string; completed_date: string };

function mapCompletion(row: CompletionRow): Completion {
  return { id: row.id, habitId: row.habit_id, completedDate: row.completed_date };
}

export async function getCompletionsForRange(startDate: string, endDate: string): Promise<Completion[]> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("habit_completions")
    .select("id, habit_id, completed_date")
    .eq("user_id", user.id)
    .gte("completed_date", startDate)
    .lte("completed_date", endDate);

  if (error) {
    console.error("getCompletionsForRange failed", error);
    throw new Error("Could not load completions.");
  }

  return (data ?? []).map((row) => mapCompletion(row as CompletionRow));
}

export async function getCompletionsForHabit(habitId: string): Promise<Completion[]> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("habit_completions")
    .select("id, habit_id, completed_date")
    .eq("user_id", user.id)
    .eq("habit_id", habitId)
    .order("completed_date", { ascending: false });

  if (error) {
    console.error("getCompletionsForHabit failed", error);
    throw new Error("Could not load completions.");
  }

  return (data ?? []).map((row) => mapCompletion(row as CompletionRow));
}

/**
 * Toggles a habit's completion for one date: inserts a row if none exists,
 * deletes it if one does. `user_id` on insert is always the caller's own id
 * — never accepted as an argument — and is further enforced by the
 * `completions_insert_own` RLS policy and the `enforce_completion_owner`
 * trigger (supabase/migrations/0002_rls.sql, 0003_triggers.sql).
 */
export async function toggleCompletion(
  habitId: string,
  date: string,
): Promise<"completed" | "uncompleted"> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: existing, error: selectError } = await supabase
    .from("habit_completions")
    .select("id")
    .eq("user_id", user.id)
    .eq("habit_id", habitId)
    .eq("completed_date", date)
    .maybeSingle();

  if (selectError) {
    console.error("toggleCompletion select failed", selectError);
    throw new Error("Could not update completion.");
  }

  if (existing) {
    const { error } = await supabase
      .from("habit_completions")
      .delete()
      .eq("id", existing.id)
      .eq("user_id", user.id);

    if (error) {
      console.error("toggleCompletion delete failed", error);
      throw new Error("Could not update completion.");
    }
    return "uncompleted";
  }

  const { error: insertError } = await supabase.from("habit_completions").insert({
    habit_id: habitId,
    user_id: user.id,
    completed_date: date,
  });

  if (insertError) {
    console.error("toggleCompletion insert failed", insertError);
    throw new Error("Could not update completion.");
  }

  return "completed";
}
