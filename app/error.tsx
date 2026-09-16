"use client";

import { useEffect } from "react";
import { LinkButton } from "@/components/ui/button";

// A generic error boundary. The real error is logged server-side only —
// never rendered to the client, to avoid leaking Postgres/PostgREST
// details such as column or policy names. See ARCHITECTURE.md §5 (#17).
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-4 text-center">
      <h1 className="text-2xl font-semibold text-slate-900">Something went wrong</h1>
      <p className="max-w-sm text-sm text-slate-500">
        Please try again. If the problem continues, come back later.
      </p>
      <LinkButton href="/">Back to home</LinkButton>
    </div>
  );
}
