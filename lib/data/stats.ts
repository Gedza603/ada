import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/require-user";

export type HabitStats = {
  habitId: string;
  currentStreak: number;
  totalCompletions: number;
  completedToday: boolean;
};

export type DashboardStats = {
  totalHabits: number;
  completedToday: number;
  totalCompletionsAllTime: number;
};

/**
 * Server date in UTC. Per-user local "today" (via profiles.timezone) is a
 * documented v2 improvement — see ARCHITECTURE.md §2.
 */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getHabitStats(habitId: string): Promise<HabitStats> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("habit_completions")
    .select("completed_date")
    .eq("user_id", user.id)
    .eq("habit_id", habitId);

  if (error) {
    console.error("getHabitStats failed", error);
    throw new Error("Could not load stats.");
  }

  const dateSet = new Set((data ?? []).map((r) => r.completed_date as string));
  const todayStr = today();

  let currentStreak = 0;
  const cursor = new Date(`${todayStr}T00:00:00Z`);
  if (!dateSet.has(todayStr)) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  while (dateSet.has(cursor.toISOString().slice(0, 10))) {
    currentStreak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  return {
    habitId,
    currentStreak,
    totalCompletions: dateSet.size,
    completedToday: dateSet.has(todayStr),
  };
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const user = await requireUser();
  const supabase = await createClient();
  const todayStr = today();

  const [habitsResult, todayResult, totalResult] = await Promise.all([
    supabase.from("habits").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase
      .from("habit_completions")
      .select("habit_id")
      .eq("user_id", user.id)
      .eq("completed_date", todayStr),
    supabase
      .from("habit_completions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
  ]);

  if (habitsResult.error || todayResult.error || totalResult.error) {
    console.error(
      "getDashboardStats failed",
      habitsResult.error ?? todayResult.error ?? totalResult.error,
    );
    throw new Error("Could not load dashboard stats.");
  }

  return {
    totalHabits: habitsResult.count ?? 0,
    completedToday: (todayResult.data ?? []).length,
    totalCompletionsAllTime: totalResult.count ?? 0,
  };
}
