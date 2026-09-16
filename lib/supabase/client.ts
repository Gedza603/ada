import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";

/**
 * Browser Supabase client. Used only for auth actions from Client
 * Components (sign in / sign up / sign out) and to react to auth-state
 * changes. Never used to read or write habit data directly — all data
 * access goes through Server Actions / Server Components (lib/data/*),
 * which run under the user's verified session and Postgres RLS.
 */
export function createClient() {
  return createBrowserClient(getSupabaseUrl(), getSupabaseAnonKey());
}
