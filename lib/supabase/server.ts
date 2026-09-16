import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";

/**
 * Request-scoped Supabase client for Server Components, Server Actions, and
 * Route Handlers. Always built fresh per request (never a module-level
 * singleton) and always uses the anon key — there is no service-role client
 * anywhere in this app. Every query made with this client is filtered by
 * Postgres Row Level Security for the signed-in user.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Writing cookies from a Server Component render throws — this is
          // expected and harmless. Session refresh is handled by proxy.ts
          // (Next.js 16's middleware) on the request path instead.
        }
      },
    },
  });
}
