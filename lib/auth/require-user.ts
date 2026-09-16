import "server-only";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Layer 2 of the three-layer auth check (see ARCHITECTURE.md §1.2). Must be
 * the first statement in every protected page.tsx, layout.tsx, and Server
 * Action. Redirects to /login on no session; never returns null. Layer 3
 * (RLS on every query) is what actually enforces authorization even if this
 * layer, or proxy.ts, were bypassed.
 */
export async function requireUser(): Promise<User> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}
