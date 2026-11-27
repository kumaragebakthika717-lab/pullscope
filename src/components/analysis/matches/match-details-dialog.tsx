"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
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
import type { MatchAnalysis } from "@/lib/analysis/types";

export function MatchDetailsDialog({
  open,
  analysis,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  analysis: MatchAnalysis | null;
  onOpenChange: (open: boolean) => void;
  onSave: (next: MatchAnalysis) => void;
}) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [opponent, setOpponent] = useState("");
  const [eventName, setEventName] = useState("");
  const [fpsInput, setFpsInput] = useState("30");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !analysis) return;
    setTitle(analysis.title);
    setDate(analysis.date);
    setOpponent(analysis.opponent);
    setEventName(analysis.event_name);
    setFpsInput(String(analysis.fps));
    setError(null);
    setBusy(false);
  }, [open, analysis]);

  function submit() {
    if (!analysis) return;
    if (!title.trim()) {
      setError("Title cannot be empty.");
      return;
    }
    const fps = Number(fpsInput);
    if (!Number.isFinite(fps) || fps < 1 || fps > 480) {
      setError("FPS must be between 1 and 480.");
      return;
    }
    setBusy(true);
    const frameScale = fps;
    onSave({
      ...analysis,
      title: title.trim(),
      date,
      opponent: opponent.trim(),
      event_name: eventName.trim(),
      fps,
      fps_source: fps === analysis.fps ? analysis.fps_source : "manual",
      events: analysis.events.map((event) => ({ ...event, frame: Math.max(0, Math.floor(event.t * frameScale + 1e-6)) })),
      updated_at: new Date().toISOString(),
    });
    setBusy(false);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (!busy ? onOpenChange(next) : undefined)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-xl uppercase tracking-wide">Match details</DialogTitle>
          <DialogDescription>
            Changing the frame rate re-maps every saved tag to the new frame grid. Times are unchanged.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="details-title">Title</Label>
            <Input id="details-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="details-date">Date</Label>
            <Input id="details-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="details-fps">Frame rate</Label>
            <Input
              id="details-fps"
              inputMode="decimal"
              value={fpsInput}
              onChange={(e) => setFpsInput(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="details-opponent">Opponent</Label>
            <Input id="details-opponent" value={opponent} maxLength={80} onChange={(e) => setOpponent(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="details-event">Event</Label>
            <Input id="details-event" value={eventName} maxLength={120} onChange={(e) => setEventName(e.target.value)} />
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
            Save details
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
