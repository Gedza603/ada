import Link from "next/link";
import { requireUser } from "@/lib/auth/require-user";
import { SignOutButton } from "@/components/auth/sign-out-button";

// Layer 2 of the three-layer auth check — see ARCHITECTURE.md §1.2. Covers
// the case where proxy.ts's matcher is bypassed or disabled; every data
// query underneath is still independently scoped by RLS regardless.
export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  await requireUser();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/dashboard" className="text-lg font-bold text-slate-900">
            Habitly
          </Link>
          <SignOutButton />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
    </div>
  );
}
