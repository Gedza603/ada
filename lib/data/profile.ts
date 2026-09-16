import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/require-user";

export type Profile = {
  id: string;
  displayName: string | null;
  timezone: string;
};

/**
 * Profile rows are created only by the handle_new_user() database trigger
 * (supabase/migrations/0003_triggers.sql) — there is no client insert path.
 * A missing profile is treated as non-fatal; callers should fall back to
 * `user.email` for display rather than fail the page.
 */
export async function getProfile(): Promise<Profile | null> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, timezone")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error("getProfile failed", error);
    return null;
  }

  if (!data) return null;

  return { id: data.id, displayName: data.display_name, timezone: data.timezone };
}
