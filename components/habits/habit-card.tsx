import Link from "next/link";
import type { Habit } from "@/lib/data/habits";
import { Card } from "@/components/ui/card";
import { CompletionToggle } from "@/components/habits/completion-toggle";
import { DeleteHabitButton } from "@/components/habits/delete-habit-button";

export function HabitCard({
  habit,
  today,
  completedToday,
  onToggle,
  onDelete,
}: {
  habit: Habit;
  today: string;
  completedToday: boolean;
  onToggle: (habitId: string, date: string) => Promise<void>;
  onDelete: (habitId: string) => Promise<void>;
}) {
  return (
    <Card className="flex items-start justify-between gap-4 p-5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: habit.color }}
          />
          <Link
            href={`/habits/${habit.id}`}
            className="truncate font-medium text-slate-900 hover:text-indigo-600"
          >
            {habit.name}
          </Link>
        </div>
        {habit.category && (
          <span className="mt-1.5 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
            {habit.category}
          </span>
        )}
        {habit.description && (
          <p className="mt-2 line-clamp-2 text-sm text-slate-500">{habit.description}</p>
        )}
        <Link
          href={`/habits/${habit.id}`}
          className="mt-3 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-500"
        >
          View &amp; edit →
        </Link>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <CompletionToggle
          habitId={habit.id}
          date={today}
          completed={completedToday}
          label="Mark today complete"
          action={onToggle}
        />
        <DeleteHabitButton habitId={habit.id} habitName={habit.name} action={onDelete} />
      </div>
    </Card>
  );
}
