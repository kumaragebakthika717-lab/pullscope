"use client";

import { useEffect, useMemo, useState } from "react";
import { CopyPlus, Loader2, Plus, Trash2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { saveSpeedSession } from "@/lib/analysis/store";
import { formatSeconds, parseTimeInput, todayISO } from "@/lib/analysis/format";
import { intervalPace, sessionMetrics } from "@/lib/analysis/metrics";
import type { SpeedDiscipline, SpeedSession } from "@/lib/analysis/types";

type RowDraft = { distance: string; time: string; rest: string };

const DISCIPLINES: { value: SpeedDiscipline; label: string }[] = [
  { value: "sprint", label: "Sprints" },
  { value: "rounds", label: "Rounds / pulls" },
  { value: "distance", label: "Continuous distance" },
];

function emptyRow(): RowDraft {
  return { distance: "", time: "", rest: "" };
}

function rowFromInterval(interval: SpeedSession["intervals"][number]): RowDraft {
  return {
    distance: interval.distance_m === null ? "" : String(interval.distance_m),
    time: formatSeconds(interval.time_sec),
    rest: interval.rest_sec === null ? "" : String(interval.rest_sec),
  };
}

export function SpeedSessionDialog({
  open,
  session,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  session: SpeedSession | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [date, setDate] = useState(todayISO());
  const [title, setTitle] = useState("");
  const [discipline, setDiscipline] = useState<SpeedDiscipline>("sprint");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<RowDraft[]>([emptyRow()]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (session) {
      setDate(session.date);
      setTitle(session.title);
      setDiscipline(session.discipline);
      setNotes(session.notes);
      setRows(session.intervals.length ? session.intervals.map(rowFromInterval) : [emptyRow()]);
    } else {
      setDate(todayISO());
      setTitle("");
      setDiscipline("sprint");
      setNotes("");
      setRows([emptyRow()]);
    }
    setError(null);
    setBusy(false);
  }, [open, session]);

  const preview = useMemo(() => sessionMetrics({
    id: "preview",
    date,
    title,
    discipline,
    notes,
    intervals: rows
      .map((row) => ({
        distance_m: row.distance.trim() ? Number(row.distance) : null,
        time_sec: parseTimeInput(row.time) ?? 0,
        rest_sec: row.rest.trim() ? Number(row.rest) : null,
      }))
      .filter((interval) => interval.time_sec > 0),
    created_at: "",
    updated_at: "",
  }), [rows, date, title, discipline, notes]);

  function updateRow(index: number, patch: Partial<RowDraft>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function duplicateLast() {
    setRows((current) => [...current, { ...(current[current.length - 1] ?? emptyRow()) }]);
  }

  async function submit() {
    const filled = rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => row.time.trim() || row.distance.trim() || row.rest.trim());
    if (!filled.length) {
      setError("Add at least one interval.");
      return;
    }
    const intervals: SpeedSession["intervals"] = [];
    for (const { row, index } of filled) {
      const time = parseTimeInput(row.time);
      if (time === null) {
        setError(`Interval ${index + 1}: enter a time like 12.4 or 1:23.40.`);
        return;
      }
      const distance = row.distance.trim() ? Number(row.distance) : null;
      if (distance !== null && (!Number.isFinite(distance) || distance <= 0)) {
        setError(`Interval ${index + 1}: distance must be a positive number of metres (or blank).`);
        return;
      }
      const rest = row.rest.trim() ? Number(row.rest) : null;
      if (rest !== null && (!Number.isFinite(rest) || rest < 0)) {
        setError(`Interval ${index + 1}: rest must be zero or more seconds (or blank).`);
        return;
      }
      intervals.push({ time_sec: time, distance_m: distance, rest_sec: rest });
    }

    setBusy(true);
    const timestamp = new Date().toISOString();
    const record: SpeedSession = {
      id: session?.id ?? crypto.randomUUID(),
      date,
      title: title.trim() || DISCIPLINES.find((d) => d.value === discipline)!.label,
      discipline,
      notes: notes.trim(),
      intervals,
      created_at: session?.created_at ?? timestamp,
      updated_at: timestamp,
    };
    try {
      await saveSpeedSession(record);
      toast.success(session ? "Session updated." : "Session saved on this device.");
      onSaved();
      onOpenChange(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (!busy ? onOpenChange(next) : undefined)}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl uppercase tracking-wide">
            {session ? "Edit session" : "Log a session"}
          </DialogTitle>
          <DialogDescription>
            Times accept <span className="text-foreground">12.4</span> or <span className="text-foreground">1:23.40</span>.
            Distance is per interval — leave it blank for rounds where only the time matters.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[62vh] space-y-4 overflow-y-auto pr-1">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="speed-date">Date</Label>
              <Input id="speed-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Discipline</Label>
              <Select value={discipline} onValueChange={(value) => setDiscipline(value as SpeedDiscipline)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DISCIPLINES.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="speed-title">Title</Label>
            <Input
              id="speed-title"
              value={title}
              maxLength={120}
              placeholder="e.g. Hill sprints, 6 rounds on the table"
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-end justify-between">
              <Label>Intervals</Label>
              <span className="text-xs text-muted-foreground">Distance (m) · Time · Rest after (s)</span>
            </div>
            <div className="space-y-2">
              {rows.map((row, index) => {
                const pace = intervalPace({
                  distance_m: row.distance.trim() ? Number(row.distance) : null,
                  time_sec: parseTimeInput(row.time) ?? 0,
                  rest_sec: null,
                });
                return (
                  <div key={index} className="grid grid-cols-[2rem_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,0.9fr)_4.5rem_2rem] items-center gap-2">
                    <span className="text-xs tabular-nums text-muted-foreground">{index + 1}</span>
                    <Input
                      inputMode="decimal"
                      placeholder="100"
                      aria-label={`Interval ${index + 1} distance in metres`}
                      value={row.distance}
                      onChange={(e) => updateRow(index, { distance: e.target.value })}
                    />
                    <Input
                      placeholder="12.4"
                      aria-label={`Interval ${index + 1} time`}
                      value={row.time}
                      onChange={(e) => updateRow(index, { time: e.target.value })}
                    />
                    <Input
                      inputMode="decimal"
                      placeholder="60"
                      aria-label={`Interval ${index + 1} rest in seconds`}
                      value={row.rest}
                      onChange={(e) => updateRow(index, { rest: e.target.value })}
                    />
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {pace !== null ? `${pace.toFixed(1)}/100m` : "—"}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove interval ${index + 1}`}
                      disabled={rows.length === 1}
                      onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setRows((current) => [...current, emptyRow()])}>
                <Plus /> Add interval
              </Button>
              <Button variant="ghost" size="sm" onClick={duplicateLast}>
                <CopyPlus /> Duplicate last
              </Button>
            </div>
          </div>

          {preview && (
            <p className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              {preview.count} intervals · {preview.total_distance_m !== null ? `${preview.total_distance_m} m · ` : ""}
              avg {preview.basis === "distance" ? `${formatSeconds(preview.avg_effort)} /100m` : `${formatSeconds(preview.avg_effort)} /interval`}
              {preview.fade_pct !== null ? ` · fade ${preview.fade_pct > 0 ? "+" : ""}${preview.fade_pct.toFixed(1)}%` : ""}
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="speed-notes">Notes</Label>
            <Textarea
              id="speed-notes"
              rows={2}
              maxLength={600}
              value={notes}
              placeholder="Grip, surface, warm-up, how it felt"
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        {error && (
          <p className="text-sm text-bad" role="alert">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy} className="font-semibold">
            {busy && <Loader2 className="animate-spin" />}
            {session ? "Save changes" : "Save session"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
