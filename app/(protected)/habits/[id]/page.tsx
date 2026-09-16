import { notFound } from "next/navigation";
import Link from "next/link";
import { getHabitById } from "@/lib/data/habits";
import { getCompletionsForHabit } from "@/lib/data/completions";
import { getHabitStats } from "@/lib/data/stats";
import { requireUser } from "@/lib/auth/require-user";
import { HabitForm } from "@/components/habits/habit-form";
import { CompletionToggle } from "@/components/habits/completion-toggle";
import { DeleteHabitButton } from "@/components/habits/delete-habit-button";
import { StatTile } from "@/components/habits/stat-tile";
import {
  updateHabitAction,
  deleteHabitAndRedirectAction,
  toggleCompletionOnDetailAction,
} from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "default-no-store";

function lastNDays(n: number): string[] {
  const days: string[] = [];
  const cursor = new Date();
  for (let i = 0; i < n; i++) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return days.reverse();
}

export default async function HabitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Layer 1 (auth): must be signed in at all.
  await requireUser();
  const { id } = await params;

  // Layer 2 (authorization): getHabitById() filters by the caller's user_id
  // AND is independently enforced by the habits_select_own RLS policy. A
  // habit that exists but belongs to someone else is indistinguishable from
  // one that doesn't exist — both return null here and both 404. This is
  // what stops an attacker who guesses another user's habit id.
  // See ARCHITECTURE.md §4.2 and §5 (#1).
  const habit = await getHabitById(id);
  if (!habit) {
    notFound();
  }

  const [completions, stats] = await Promise.all([
    getCompletionsForHabit(habit.id),
    getHabitStats(habit.id),
  ]);
  const completedDates = new Set(completions.map((c) => c.completedDate));
  const days = lastNDays(28);

  return (
    <div className="space-y-8">
      <div>
        <Link href="/dashboard" className="text-sm text-slate-500 hover:text-slate-700">
          ← Back to dashboard
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: habit.color }} />
          <h1 className="text-2xl font-semibold text-slate-900">{habit.name}</h1>
        </div>
        {habit.category && (
          <span className="mt-2 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
            {habit.category}
          </span>
        )}
        {habit.description && (
          <p className="mt-2 max-w-2xl text-slate-600">{habit.description}</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile
          label="Current streak"
          value={`${stats.currentStreak} day${stats.currentStreak === 1 ? "" : "s"}`}
        />
        <StatTile label="Total completions" value={stats.totalCompletions} />
        <StatTile label="Today" value={stats.completedToday ? "Done ✓" : "Not yet"} />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-medium text-slate-900">Last 28 days</h2>
        <p className="mt-1 text-xs text-slate-500">Click a day to mark or unmark it.</p>
        <div className="mt-4 grid grid-cols-7 gap-2">
          {days.map((date) => (
            <CompletionToggle
              key={date}
              habitId={habit.id}
              date={date}
              completed={completedDates.has(date)}
              label={date}
              action={toggleCompletionOnDetailAction}
            />
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-medium text-slate-900">Edit habit</h2>
        <HabitForm
          action={updateHabitAction.bind(null, habit.id)}
          initial={habit}
          mode="edit"
          submitLabel="Save changes"
        />
      </div>

      <div className="flex justify-end">
        <DeleteHabitButton
          habitId={habit.id}
          habitName={habit.name}
          action={deleteHabitAndRedirectAction}
        />
      </div>
    </div>
  );
}
