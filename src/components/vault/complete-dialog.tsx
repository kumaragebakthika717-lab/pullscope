"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NumInput } from "@/components/vault/num-input";
import { BLOCK_LABELS } from "@/lib/vault/format";
import { completeWorkout } from "@/app/actions/vault";
import type { WorkoutPlan } from "@/lib/vault/types";

type Row = {
  id: string;
  name: string;
  block: string;
  done: boolean;
  actual_sets: number | null;
  actual_reps: number | null;
  actual_mass_kg: number | null;
  actual_hold_seconds: number | null;
  actual_rpe: number | null;
};

function rowsFor(plan: WorkoutPlan): Row[] {
  return plan.exercises.map((e) => ({
    id: e.id,
    name: e.name,
    block: BLOCK_LABELS[e.block],
    done: true,
    actual_sets: e.actual_sets ?? e.sets,
    actual_reps: e.actual_reps ?? e.reps,
    actual_mass_kg: e.actual_mass_kg ?? e.mass_kg,
    actual_hold_seconds: e.actual_hold_seconds ?? e.hold_seconds,
    actual_rpe: e.actual_rpe ?? e.rpe,
  }));
}

export function CompleteDialog({
  plan,
  open,
  onOpenChange,
  onCompleted,
}: {
  plan: WorkoutPlan;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted: (plan: WorkoutPlan) => void;
}) {
  const [rows, setRows] = useState<Row[]>(() => rowsFor(plan));
  const [sessionNotes, setSessionNotes] = useState(plan.session_notes ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setRows(rowsFor(plan));
      setSessionNotes(plan.session_notes ?? "");
    }
  }, [open, plan]);

  function patchRow(index: number, next: Partial<Row>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...next } : row)));
  }

  async function submit() {
    setBusy(true);
    const res = await completeWorkout({
      planId: plan.id,
      sessionNotes: sessionNotes.trim() || null,
      exercises: rows.map((row) => ({
        id: row.id,
        done: row.done,
        actual_sets: row.actual_sets,
        actual_reps: row.actual_reps,
        actual_mass_kg: row.actual_mass_kg,
        actual_hold_seconds: row.actual_hold_seconds,
        actual_rpe: row.actual_rpe,
      })),
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Session saved to the vault.");
    onCompleted(res.data);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (!busy ? onOpenChange(next) : undefined)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl uppercase tracking-wide">Log the session</DialogTitle>
          <DialogDescription>
            Tick what you actually did. Planned values are prefilled — change only what differed. Completed sessions feed the
            next plan.
          </DialogDescription>
        </DialogHeader>

        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            This day had no planned exercises. Completing it records the rest day and updates the vault.
          </p>
        ) : (
          <div className="-mx-4 overflow-x-auto px-4">
            <table className="w-full min-w-[640px] text-xs">
              <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="w-10 pb-2 font-medium">Done</th>
                  <th className="min-w-40 pb-2 font-medium">Exercise</th>
                  <th className="w-16 pb-2 font-medium">Sets</th>
                  <th className="w-16 pb-2 font-medium">Reps</th>
                  <th className="w-16 pb-2 font-medium">Hold s</th>
                  <th className="w-20 pb-2 font-medium">Mass kg</th>
                  <th className="w-16 pb-2 font-medium">RPE</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.id} className="border-t border-border/60">
                    <td className="py-1.5">
                      <input
                        type="checkbox"
                        aria-label={`Completed ${row.name}`}
                        checked={row.done}
                        onChange={(e) => patchRow(index, { done: e.target.checked })}
                        className="size-4 accent-brand"
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <div className="font-medium text-foreground">{row.name}</div>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{row.block}</div>
                    </td>
                    <td className="py-1.5 pr-2">
                      <NumInput
                        value={row.actual_sets}
                        min={0}
                        max={30}
                        onChange={(value) => patchRow(index, { actual_sets: value })}
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <NumInput
                        value={row.actual_reps}
                        min={0}
                        max={200}
                        onChange={(value) => patchRow(index, { actual_reps: value })}
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <NumInput
                        value={row.actual_hold_seconds}
                        min={0}
                        max={900}
                        step={5}
                        onChange={(value) => patchRow(index, { actual_hold_seconds: value })}
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <NumInput
                        value={row.actual_mass_kg}
                        min={0}
                        max={600}
                        step={0.5}
                        onChange={(value) => patchRow(index, { actual_mass_kg: value })}
                      />
                    </td>
                    <td className="py-1.5">
                      <NumInput
                        value={row.actual_rpe}
                        min={0}
                        max={10}
                        step={0.5}
                        onChange={(value) => patchRow(index, { actual_rpe: value })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="session-notes">Session notes</Label>
          <Textarea
            id="session-notes"
            value={sessionNotes}
            maxLength={1000}
            rows={3}
            placeholder="How it felt, what to change next time, any niggle."
            onChange={(e) => setSessionNotes(e.target.value)}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy} className="font-semibold">
            {busy && <Loader2 className="animate-spin" />}
            {busy ? "Saving…" : "Complete session"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}