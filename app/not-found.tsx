import { LinkButton } from "@/components/ui/button";

// Also what /habits/[id] renders for a habit that doesn't exist OR belongs
// to another user — the two cases are made intentionally indistinguishable.
// See ARCHITECTURE.md §4.2 and §5 (#1).
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-4 text-center">
      <h1 className="text-2xl font-semibold text-slate-900">Page not found</h1>
      <p className="max-w-sm text-sm text-slate-500">
        This page doesn&apos;t exist, or you don&apos;t have access to it.
      </p>
      <LinkButton href="/">Back to home</LinkButton>
    </div>
  );
}
