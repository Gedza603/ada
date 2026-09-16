"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signUpSchema } from "@/lib/validation/schemas";
import { safeRedirect } from "@/lib/auth/safe-redirect";
import { getSiteUrl } from "@/lib/supabase/env";

export type SignUpState = { error: string | null };

export async function signUp(_prevState: SignUpState, formData: FormData): Promise<SignUpState> {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    displayName: formData.get("displayName") || undefined,
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Please check your details and try again.",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: parsed.data.displayName ? { display_name: parsed.data.displayName } : undefined,
      emailRedirectTo: `${getSiteUrl()}/auth/confirm`,
    },
  });

  if (error) {
    const isDuplicate =
      error.code === "user_already_exists" || /already registered|already exists/i.test(error.message);

    if (isDuplicate) {
      // Same outcome as a brand-new signup, so the response can't be used
      // to enumerate which emails already have an account.
      // See ARCHITECTURE.md §5 (#13).
      redirect("/signup?check-email=1");
    }

    return { error: "Could not sign up. Please try again." };
  }

  // With "Confirm email" disabled (this project's evaluation setting),
  // signUp returns an active session immediately.
  if (data.session) {
    const next = safeRedirect(formData.get("next")?.toString());
    redirect(next);
  }

  redirect("/signup?check-email=1");
}
