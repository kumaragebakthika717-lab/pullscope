"use client";

import { Plus, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SLOT_LABELS } from "@/lib/vault/program";
import { BLOCK_OPTIONS } from "@/lib/vault/format";
import { NumInput } from "@/components/vault/num-input";
import type { PlanPayload } from "@/lib/vault/schemas";
import type { ConcreteSlot, ExerciseBlock, ExerciseDraft, IntensityType } from "@/lib/vault/types";

const EMPTY_EXERCISE: ExerciseDraft = {
  block: "main",
  name: "",
  sets: 3,
  mass_kg: null,
  mass_note: null,
  reps: 5,
  hold_seconds: null,
  rest_seconds: 120,
  intensity_type: "rpe",
  rpe: 7,
  percent_1rm: null,
  notes: null,
};

const SLOT_OPTIONS = Object.entries(SLOT_LABELS) as [ConcreteSlot, string][];

function intensityPatch(type: IntensityType): Partial<ExerciseDraft> {
  if (type === "rpe") return { intensity_type: type, percent_1rm: null };
  if (type === "percent_1rm") return { intensity_type: type, rpe: null };
  return { intensity_type: type, rpe: null, percent_1rm: null };
}

export function PlanEditor({
  payload,
  onChange,
  locked,
}: {
  payload: PlanPayload;
  onChange: (payload: PlanPayload) => void;
  locked: boolean;
}) {
  function patch(next: Partial<PlanPayload>) {
    onChange({ ...payload, ...next });
  }

  function patchExercise(index: number, next: Partial<ExerciseDraft>) {
    patch({
      exercises: payload.exercises.map((exercise, i) => (i === index ? { ...exercise, ...next } : exercise)),
    });
  }

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="font-display text-lg uppercase tracking-wide">Session plan</CardTitle>
            <CardDescription>
              Edit anything before you confirm. Warm-ups, sets, loads, holds, rest and intensity all stay editable.
            </CardDescription>
          </div>
          {locked && <Badge variant="outline">Locked — reopen to edit</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="vault-title">Title</Label>
            <Input
              id="vault-title"
              value={payload.title}
              maxLength={160}
              disabled={locked}
              onChange={(e) => patch({ title: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Day type</Label>
            <Select
              value={payload.day_type}
              disabled={locked}
              onValueChange={(value) => patch({ day_type: value as ConcreteSlot })}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SLOT_OPTIONS.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vault-duration">Duration (min)</Label>
            <NumInput
              id="vault-duration"
              value={payload.duration_min}
              min={0}
              max={240}
              step={5}
              disabled={locked}
              onChange={(value) => patch({ duration_min: value })}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="vault-focus">Focus</Label>
            <Input
              id="vault-focus"
              value={payload.focus}
              maxLength={120}
              disabled={locked}
              onChange={(e) => patch({ focus: e.target.value })}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="vault-rationale">Why this session</Label>
          <Textarea
            id="vault-rationale"
            value={payload.rationale ?? ""}
            disabled={locked}
            rows={3}
            onChange={(e) => patch({ rationale: e.target.value })}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="vault-notes">Plan notes</Label>
          <Textarea
            id="vault-notes"
            value={payload.notes ?? ""}
            disabled={locked}
            rows={2}
            placeholder="Ramp sets, cues, anything you want beside the session."
            onChange={(e) => patch({ notes: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Warnings</Label>
            {!locked && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => patch({ warnings: [...payload.warnings, ""] })}
              >
                <Plus /> Add warning
              </Button>
            )}
          </div>
          {payload.warnings.length === 0 ? (
            <p className="text-xs text-muted-foreground">No warnings on this session.</p>
          ) : (
            <div className="space-y-2">
              {payload.warnings.map((warning, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    value={warning}
                    maxLength={300}
                    disabled={locked}
                    onChange={(e) =>
                      patch({ warnings: payload.warnings.map((w, i) => (i === index ? e.target.value : w)) })
                    }
                  />
                  {!locked && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Remove warning"
                      onClick={() => patch({ warnings: payload.warnings.filter((_, i) => i !== index) })}
                    >
                      <X />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <Label>Exercises</Label>
              <p className="text-xs text-muted-foreground">
                Reps for dynamic work, Hold for isometrics. Rest is in seconds. Intensity is RPE or % of 1RM.
              </p>
            </div>
            {!locked && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => patch({ exercises: [...payload.exercises, { ...EMPTY_EXERCISE }] })}
              >
                <Plus /> Add exercise
              </Button>
            )}
          </div>

          {payload.exercises.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              {payload.day_type === "rest"
                ? "Rest day — no loading planned."
                : "No exercises yet. Add the first one."}
            </div>
          ) : (
            <div className="-mx-4 overflow-x-auto px-4">
              <table className="w-full min-w-[1080px] border-separate border-spacing-y-1.5 text-xs">
                <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="w-28 pr-2 font-medium">Block</th>
                    <th className="min-w-44 pr-2 font-medium">Exercise</th>
                    <th className="w-16 pr-2 font-medium">Sets</th>
                    <th className="w-20 pr-2 font-medium">Mass kg</th>
                    <th className="w-24 pr-2 font-medium">Mass note</th>
                    <th className="w-16 pr-2 font-medium">Reps</th>
                    <th className="w-16 pr-2 font-medium">Hold s</th>
                    <th className="w-16 pr-2 font-medium">Rest s</th>
                    <th className="w-24 pr-2 font-medium">Intensity</th>
                    <th className="w-16 pr-2 font-medium">Value</th>
                    <th className="min-w-36 pr-2 font-medium">Notes</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {payload.exercises.map((exercise, index) => (
                    <tr key={index} className="align-top">
                      <td className="pr-2">
                        <Select
                          value={exercise.block}
                          disabled={locked}
                          onValueChange={(value) => patchExercise(index, { block: value as ExerciseBlock })}
                        >
                          <SelectTrigger size="sm" className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {BLOCK_OPTIONS.map(([value, label]) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="pr-2">
                        <Input
                          value={exercise.name}
                          maxLength={120}
                          disabled={locked}
                          placeholder="Exercise"
                          onChange={(e) => patchExercise(index, { name: e.target.value })}
                        />
                      </td>
                      <td className="pr-2">
                        <NumInput
                          value={exercise.sets}
                          min={0}
                          max={30}
                          disabled={locked}
                          onChange={(value) => patchExercise(index, { sets: value })}
                        />
                      </td>
                      <td className="pr-2">
                        <NumInput
                          value={exercise.mass_kg}
                          min={0}
                          max={600}
                          step={0.5}
                          disabled={locked}
                          onChange={(value) => patchExercise(index, { mass_kg: value })}
                        />
                      </td>
                      <td className="pr-2">
                        <Input
                          value={exercise.mass_note ?? ""}
                          maxLength={120}
                          disabled={locked}
                          placeholder="per hand"
                          onChange={(e) => patchExercise(index, { mass_note: e.target.value || null })}
                        />
                      </td>
                      <td className="pr-2">
                        <NumInput
                          value={exercise.reps}
                          min={0}
                          max={200}
                          disabled={locked}
                          onChange={(value) =>
                            patchExercise(index, { reps: value, ...(value !== null ? { hold_seconds: null } : {}) })
                          }
                        />
                      </td>
                      <td className="pr-2">
                        <NumInput
                          value={exercise.hold_seconds}
                          min={0}
                          max={900}
                          step={5}
                          disabled={locked}
                          onChange={(value) =>
                            patchExercise(index, { hold_seconds: value, ...(value !== null ? { reps: null } : {}) })
                          }
                        />
                      </td>
                      <td className="pr-2">
                        <NumInput
                          value={exercise.rest_seconds}
                          min={0}
                          max={900}
                          step={15}
                          disabled={locked}
                          onChange={(value) => patchExercise(index, { rest_seconds: value })}
                        />
                      </td>
                      <td className="pr-2">
                        <Select
                          value={exercise.intensity_type}
                          disabled={locked}
                          onValueChange={(value) => patchExercise(index, intensityPatch(value as IntensityType))}
                        >
                          <SelectTrigger size="sm" className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="rpe">RPE</SelectItem>
                            <SelectItem value="percent_1rm">% 1RM</SelectItem>
                            <SelectItem value="none">None</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="pr-2">
                        <NumInput
                          value={exercise.intensity_type === "percent_1rm" ? exercise.percent_1rm : exercise.rpe}
                          min={0}
                          max={exercise.intensity_type === "percent_1rm" ? 100 : 10}
                          step={0.5}
                          disabled={locked || exercise.intensity_type === "none"}
                          onChange={(value) =>
                            patchExercise(
                              index,
                              exercise.intensity_type === "percent_1rm" ? { percent_1rm: value } : { rpe: value },
                            )
                          }
                        />
                      </td>
                      <td className="pr-2">
                        <Input
                          value={exercise.notes ?? ""}
                          maxLength={500}
                          disabled={locked}
                          placeholder="Cues"
                          onChange={(e) => patchExercise(index, { notes: e.target.value || null })}
                        />
                      </td>
                      <td>
                        {!locked && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Remove exercise"
                            onClick={() => patch({ exercises: payload.exercises.filter((_, i) => i !== index) })}
                          >
                            <Trash2 />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}