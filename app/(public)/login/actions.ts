"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signInSchema } from "@/lib/validation/schemas";
import { safeRedirect } from "@/lib/auth/safe-redirect";

export type LoginState = { error: string | null };

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  // One generic message for every failure mode — bad email format, wrong
  // password, or an email that doesn't exist — so the response can never be
  // used to enumerate registered accounts. See ARCHITECTURE.md §5 (#13).
  if (!parsed.success) {
    return { error: "Invalid email or password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { error: "Invalid email or password." };
  }

  const next = safeRedirect(formData.get("next")?.toString());
  redirect(next);
}
