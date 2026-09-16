"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, FieldError } from "@/components/ui/input";

export type HabitFormState = { error: string | null; successToken: number };

export const initialHabitFormState: HabitFormState = { error: null, successToken: 0 };

const COLOR_PRESETS = ["#4F46E5", "#059669", "#DC2626", "#D97706", "#0891B2", "#DB2777"];

type HabitFormAction = (state: HabitFormState, formData: FormData) => Promise<HabitFormState>;

export function HabitForm({
  action,
  initial,
  mode,
  submitLabel,
}: {
  action: HabitFormAction;
  initial?: { name: string; description: string | null; color: string; category: string | null };
  mode: "create" | "edit";
  submitLabel: string;
}) {
  const [state, formAction, isPending] = useActionState(action, initialHabitFormState);
  const formRef = useRef<HTMLFormElement>(null);
  const [color, setColor] = useState(initial?.color ?? COLOR_PRESETS[0]);

  // Derived directly from render-time values — no effect, no ref reads
  // during render. Simpler than a timed "flash" and fully compatible with
  // the React Compiler's purity rules.
  const showSaved = mode === "edit" && !isPending && state.successToken > 0;

  // Native form reset is a DOM call, not React state — safe directly in an
  // effect body, which is the documented place to access a ref.
  useEffect(() => {
    if (state.successToken > 0 && mode === "create") {
      formRef.current?.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.successToken]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <div>
        <Label htmlFor={`${mode}-name`}>Name</Label>
        <Input
          id={`${mode}-name`}
          name="name"
          required
          maxLength={120}
          defaultValue={initial?.name}
          placeholder="e.g. Read 30 minutes"
        />
      </div>
      <div>
        <Label htmlFor={`${mode}-description`}>Description (optional)</Label>
        <Textarea
          id={`${mode}-description`}
          name="description"
          rows={2}
          maxLength={2000}
          defaultValue={initial?.description ?? ""}
          placeholder="Why does this habit matter?"
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor={`${mode}-category`}>Category (optional)</Label>
          <Input
            id={`${mode}-category`}
            name="category"
            maxLength={40}
            defaultValue={initial?.category ?? ""}
            placeholder="Health"
          />
        </div>
        <div>
          <Label>Color</Label>
          <input type="hidden" name="color" value={color} />
          <div className="flex gap-2 pt-1">
            {COLOR_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setColor(preset)}
                aria-label={`Color ${preset}`}
                aria-pressed={color === preset}
                className={`h-8 w-8 rounded-full border-2 ${
                  color === preset ? "border-slate-900" : "border-transparent"
                }`}
                style={{ backgroundColor: preset }}
              />
            ))}
          </div>
        </div>
      </div>
      <FieldError>{state.error}</FieldError>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : submitLabel}
        </Button>
        {showSaved && <span className="text-sm text-emerald-600">Saved ✓</span>}
      </div>
    </form>
  );
}
