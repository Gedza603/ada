import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/require-user";
import type { HabitInput } from "@/lib/validation/schemas";

export type Habit = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  category: string | null;
  createdAt: string;
  updatedAt: string;
};

type HabitRow = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  category: string | null;
  created_at: string;
  updated_at: string;
};

const HABIT_COLUMNS = "id, name, description, color, category, created_at, updated_at";

function mapHabit(row: HabitRow): Habit {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    color: row.color,
    category: row.category,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Every function below is scoped to the caller's own rows in two
 * independent ways: the explicit `.eq('user_id', user.id)` filter (for
 * index usage and readability) and Postgres RLS (the actual security
 * boundary — see supabase/migrations/0002_rls.sql). Neither `user_id` nor
 * any other ownership field is ever accepted as a function argument from
 * client input.
 */

export async function getHabits(): Promise<Habit[]> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("habits")
    .select(HABIT_COLUMNS)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getHabits failed", error);
    throw new Error("Could not load habits.");
  }

  return (data ?? []).map((row) => mapHabit(row as HabitRow));
}

export async function getHabitById(id: string): Promise<Habit | null> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("habits")
    .select(HABIT_COLUMNS)
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("getHabitById failed", error);
    throw new Error("Could not load habit.");
  }

  return data ? mapHabit(data as HabitRow) : null;
}

export async function createHabit(input: HabitInput): Promise<Habit> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("habits")
    .insert({
      user_id: user.id,
      name: input.name,
      description: input.description ?? null,
      color: input.color,
      category: input.category ?? null,
    })
    .select(HABIT_COLUMNS)
    .single();

  if (error) {
    console.error("createHabit failed", error);
    throw new Error("Could not create habit.");
  }

  return mapHabit(data as HabitRow);
}

export async function updateHabit(id: string, input: HabitInput): Promise<Habit | null> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("habits")
    .update({
      name: input.name,
      description: input.description ?? null,
      color: input.color,
      category: input.category ?? null,
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .select(HABIT_COLUMNS)
    .maybeSingle();

  if (error) {
    console.error("updateHabit failed", error);
    throw new Error("Could not update habit.");
  }

  return data ? mapHabit(data as HabitRow) : null;
}

export async function deleteHabit(id: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();

  const { error } = await supabase.from("habits").delete().eq("id", id).eq("user_id", user.id);

  if (error) {
    console.error("deleteHabit failed", error);
    throw new Error("Could not delete habit.");
  }
}
