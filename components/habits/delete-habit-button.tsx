"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";

export function DeleteHabitButton({
  habitId,
  habitName,
  action,
}: {
  habitId: string;
  habitName: string;
  action: (habitId: string) => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="danger"
      disabled={isPending}
      onClick={() => {
        if (!window.confirm(`Delete "${habitName}"? This also deletes its completion history.`)) {
          return;
        }
        startTransition(() => action(habitId));
      }}
    >
      {isPending ? "Deleting…" : "Delete"}
    </Button>
  );
}
