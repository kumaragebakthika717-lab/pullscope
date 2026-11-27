"use client";

import { useEffect, useRef, useState } from "react";
import { Film, Info, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_FPS, MAX_UPLOAD_BYTES } from "@/lib/constants";
import { detectVideoFps, readVideoDuration } from "@/lib/analysis/video";
import { deleteVideo, putVideo, saveMatchAnalysis } from "@/lib/analysis/store";
import { todayISO } from "@/lib/analysis/format";
import type { FpsSource, MatchAnalysis } from "@/lib/analysis/types";

export function MatchSetup({ onCreated, onCancel }: { onCreated: (analysis: MatchAnalysis, videoUrl: string) => void; onCancel: () => void }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(todayISO());
  const [opponent, setOpponent] = useState("");
  const [eventName, setEventName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [detectedFps, setDetectedFps] = useState<number | null>(null);
  const [fpsInput, setFpsInput] = useState(String(DEFAULT_FPS));
  const [probing, setProbing] = useState(false);
  const [keepVideo, setKeepVideo] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);
  const handedOff = useRef(false);

  useEffect(() => {
    return () => {
      if (urlRef.current && !handedOff.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  async function chooseFile(next: File | null) {
    if (!next) return;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    handedOff.current = false;
    setFile(null);
    setUrl(null);
    setDuration(null);
    setDetectedFps(null);
    setError(null);
    setProbing(true);

    const objectUrl = URL.createObjectURL(next);
    urlRef.current = objectUrl;
    setUrl(objectUrl);
    setFile(next);
    if (!title.trim()) setTitle(next.name.replace(/\.[^.]+$/, "").slice(0, 120));
    setKeepVideo(next.size <= MAX_UPLOAD_BYTES);

    const [readDuration, fps] = await Promise.all([readVideoDuration(next), detectVideoFps(objectUrl)]);
    setProbing(false);
    if (readDuration === null) {
      setError("This browser could not read that video. Try an MP4 (H.264) file.");
      return;
    }
    setDuration(readDuration);
    if (fps) {
      setDetectedFps(fps);
      setFpsInput(String(fps));
    } else {
      setDetectedFps(null);
      setFpsInput(String(DEFAULT_FPS));
    }
  }

  const parsedFps = Number(fpsInput);
  const fpsValid = Number.isFinite(parsedFps) && parsedFps >= 1 && parsedFps <= 480;
  const effectiveFps = fpsValid ? parsedFps : DEFAULT_FPS;
  const effectiveSource: FpsSource =
    detectedFps !== null && Math.abs(parsedFps - detectedFps) < 0.01
      ? "detected"
      : detectedFps === null && Math.abs(parsedFps - DEFAULT_FPS) < 0.01
        ? "default"
        : "manual";

  async function start() {
    if (!file || !url || duration === null) {
      setError("Choose a video file first.");
      return;
    }
    if (!fpsValid) {
      setError("FPS must be between 1 and 480. Use the real frame rate for accurate frame stepping.");
      return;
    }
    setBusy(true);
    setError(null);
    const timestamp = new Date().toISOString();
    const id = crypto.randomUUID();
    let stored = false;
    if (keepVideo) {
      try {
        await putVideo(id, file);
        stored = true;
      } catch (e) {
        toast.warning(`Couldn't keep the video in this browser (${(e as Error).message}). Tags will still be saved — reattach the file next time.`);
      }
    }
    const record: MatchAnalysis = {
      id,
      title: title.trim() || file.name,
      date,
      opponent: opponent.trim(),
      event_name: eventName.trim(),
      fps: effectiveFps,
      fps_source: effectiveSource,
      duration_sec: duration,
      video_name: file.name,
      video_stored: stored,
      events: [],
      notes: "",
      created_at: timestamp,
      updated_at: timestamp,
    };
    try {
      await saveMatchAnalysis(record);
    } catch (e) {
      if (stored) await deleteVideo(id).catch(() => undefined);
      setBusy(false);
      setError((e as Error).message);
      return;
    }
    handedOff.current = true;
    setBusy(false);
    onCreated(record, url);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-lg uppercase tracking-wide">New match analysis</CardTitle>
        <CardDescription>
          The video stays on this device. Tag exchanges as you watch, then the summary is saved locally.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="match-title">Title</Label>
            <Input
              id="match-title"
              value={title}
              maxLength={120}
              placeholder="e.g. Club final vs Sam"
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="match-date">Date</Label>
            <Input id="match-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="match-opponent">Opponent</Label>
            <Input
              id="match-opponent"
              value={opponent}
              maxLength={80}
              placeholder="Optional"
              onChange={(e) => setOpponent(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="match-event">Event</Label>
            <Input
              id="match-event"
              value={eventName}
              maxLength={120}
              placeholder="Optional"
              onChange={(e) => setEventName(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="match-file">Video file</Label>
          <Input
            id="match-file"
            type="file"
            accept="video/mp4,video/webm,video/quicktime,video/x-matroska,video/*"
            onChange={(e) => void chooseFile(e.target.files?.[0] ?? null)}
          />
          {file && (
            <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              <Film className="size-3.5" />
              {file.name} · {(file.size / (1024 * 1024)).toFixed(1)} MB
              {duration !== null ? ` · ${Math.floor(duration / 60)}:${String(Math.floor(duration % 60)).padStart(2, "0")}` : ""}
              {probing ? (
                <span className="flex items-center gap-1">
                  <Loader2 className="size-3 animate-spin" /> reading frames…
                </span>
              ) : null}
            </p>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
          <div className="space-y-1.5">
            <Label htmlFor="match-fps">Frame rate</Label>
            <div className="flex items-center gap-2">
              <Input
                id="match-fps"
                inputMode="decimal"
                value={fpsInput}
                onChange={(e) => setFpsInput(e.target.value)}
                className="w-20"
              />
              <span className="text-xs text-muted-foreground">fps</span>
            </div>
          </div>
          <div className="flex items-end pb-1 text-xs text-muted-foreground">
            {probing ? (
              "Detecting the real frame rate from the file…"
            ) : detectedFps !== null ? (
              `Detected ${detectedFps} fps. Frame stepping uses this value — correct it if the file is variable frame rate.`
            ) : file ? (
              "Frame rate could not be detected. Set the video's real fps (usually 24, 25, 30, 50 or 60)."
            ) : (
              "Frame-accurate stepping uses this value."
            )}
          </div>
        </div>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-[#f59e0b]"
            checked={keepVideo && !!file && file.size <= MAX_UPLOAD_BYTES}
            disabled={!file || file.size > MAX_UPLOAD_BYTES}
            onChange={(e) => setKeepVideo(e.target.checked)}
          />
          <span>
            Keep a copy of the video in this browser so saved matches reopen without the file.
            <span className="block text-xs text-muted-foreground">
              {file && file.size > MAX_UPLOAD_BYTES
                ? "Over 500 MB — too large to keep locally. Tags still save; reattach the file to review."
                : "Stored in IndexedDB on this device only. Large files use disk space."}
            </span>
          </span>
        </label>

        <p className="flex items-start gap-2 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          No upload happens. The tag data is structured for a later optional pose-tracking pass that can reuse the same
          frame numbers.
        </p>

        {error && (
          <p className="text-sm text-bad" role="alert">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={start} disabled={busy || probing || !file || duration === null} className="font-semibold">
            {busy ? <Loader2 className="animate-spin" /> : <Upload />}
            {busy ? "Preparing…" : "Start tagging"}
          </Button>
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
