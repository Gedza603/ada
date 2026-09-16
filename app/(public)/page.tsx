import { createClient } from "@/lib/supabase/server";
import { LinkButton } from "@/components/ui/button";

// No private data is ever read or rendered here — only whether a session
// exists, to decide which call-to-action to show. See ARCHITECTURE.md §1.1.
export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <span className="text-xl font-bold text-slate-900">Habitly</span>
        <nav className="flex items-center gap-3">
          {user ? (
            <LinkButton href="/dashboard">Go to dashboard</LinkButton>
          ) : (
            <>
              <LinkButton href="/login" variant="ghost">
                Log in
              </LinkButton>
              <LinkButton href="/signup">Sign up</LinkButton>
            </>
          )}
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-6 py-20 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
          Build habits that stick.
        </h1>
        <p className="mt-5 max-w-xl text-lg text-slate-600">
          Habitly is a simple, private habit tracker. Create habits, check them off each
          day, and watch your streaks grow — visible to you, and only you.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {user ? (
            <LinkButton href="/dashboard">Go to dashboard</LinkButton>
          ) : (
            <>
              <LinkButton href="/signup">Get started — it&apos;s free</LinkButton>
              <LinkButton href="/login" variant="secondary">
                Log in
              </LinkButton>
            </>
          )}
        </div>
      </main>

      <footer className="border-t border-slate-100 py-6 text-center text-sm text-slate-400">
        Your habits are private. Only you can see them.
      </footer>
    </div>
  );
}
