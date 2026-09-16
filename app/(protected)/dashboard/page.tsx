import { getHabits } from "@/lib/data/habits";
import { getCompletionsForRange } from "@/lib/data/completions";
import { getDashboardStats } from "@/lib/data/stats";
import { HabitForm } from "@/components/habits/habit-form";
import { HabitCard } from "@/components/habits/habit-card";
import { StatTile } from "@/components/habits/stat-tile";
import { createHabitAction, deleteHabitAction, toggleCompletionAction } from "./actions";

// Never statically render or cache a page that shows per-user data.
// See ARCHITECTURE.md §5 (#11) and §1.1.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "default-no-store";

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function DashboardPage() {
  const today = todayStr();

  // requireUser() runs inside each of these (lib/data/*); every query is
  // additionally scoped by RLS to the signed-in user's own rows.
  const [habits, todaysCompletions, stats] = await Promise.all([
    getHabits(),
    getCompletionsForRange(today, today),
    getDashboardStats(),
  ]);
  const completedIds = new Set(todaysCompletions.map((c) => c.habitId));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Your habits</h1>
        <p className="mt-1 text-sm text-slate-500">Track today, build your streak.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="Habits" value={stats.totalHabits} />
        <StatTile
          label="Completed today"
          value={`${stats.completedToday}/${stats.totalHabits}`}
        />
        <StatTile label="All-time completions" value={stats.totalCompletionsAllTime} />
      </div>

      <details className="group rounded-2xl border border-slate-200 bg-white">
        <summary className="cursor-pointer list-none px-5 py-4 text-sm font-medium text-indigo-600">
          + Add a habit
        </summary>
        <div className="border-t border-slate-100 px-5 py-5">
          <HabitForm action={createHabitAction} mode="create" submitLabel="Add habit" />
        </div>
      </details>

      {habits.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 px-5 py-10 text-center text-sm text-slate-500">
          No habits yet. Add your first one above.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {habits.map((habit) => (
            <HabitCard
              key={habit.id}
              habit={habit}
              today={today}
              completedToday={completedIds.has(habit.id)}
              onToggle={toggleCompletionAction}
              onDelete={deleteHabitAction}
            />
          ))}
        </div>
      )}
    </div>
  );
}
