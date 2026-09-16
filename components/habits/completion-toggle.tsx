"use client";

import { useTransition } from "react";

export function CompletionToggle({
  habitId,
  date,
  completed,
  label,
  action,
}: {
  habitId: string;
  date: string;
  completed: boolean;
  label?: string;
  action: (habitId: string, date: string) => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(() => action(habitId, date))}
      aria-pressed={completed}
      aria-label={label ? `${label}: ${completed ? "completed" : "not completed"}` : date}
      title={label ?? date}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border text-xs font-semibold transition-colors disabled:opacity-50 ${
        completed
          ? "border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-500"
          : "border-slate-200 bg-white text-transparent hover:border-indigo-300"
      }`}
    >
      ✓
    </button>
  );
}
