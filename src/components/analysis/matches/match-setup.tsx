"use client";

import { useEffect, useRef, useState } from "react";
import { Film, Info, Link2, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_FPS, MAX_UPLOAD_BYTES } from "@/lib/constants";
import { detectVideoFps, readVideoDuration, readVideoUrlDuration } from "@/lib/analysis/video";
import { deleteVideo, putVideo, saveMatchAnalysis } from "@/lib/analysis/store";
import { todayISO } from "@/lib/analysis/format";
import { parseYoutubeId } from "@/lib/youtube";
import type { VideoSource } from "@/components/workspace/video-player";
import { cn } from "@/lib/utils";
import type { FpsSource, MatchAnalysis } from "@/lib/analysis/types";

type SourceMode = "file" | "link";
type LinkInfo = { kind: "youtube"; videoId: string } | { kind: "url"; url: string; duration: number };

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

export function MatchSetup({
  onCreated,
  onCancel,
}: {
  onCreated: (analysis: MatchAnalysis, source: VideoSource) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(todayISO());
  const [opponent, setOpponent] = useState("");
  const [eventName, setEventName] = useState("");
  const [mode, setMode] = useState<SourceMode>("file");
  const [file, setFile] = useState<File | null>(null);
  const [link, setLink] = useState("");
  const [linkInfo, setLinkInfo] = useState<LinkInfo | null>(null);
  const [linkState, setLinkState] = useState<"idle" | "checking" | "ok" | "error">("idle");
  const [linkError, setLinkError] = useState<string | null>(null);
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

  function switchMode(next: SourceMode) {
    if (next === mode) return;
    setMode(next);
    setError(null);
    if (next === "link") {
      setDetectedFps(null);
      setFpsInput(String(DEFAULT_FPS));
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
      handedOff.current = false;
      setFile(null);
      setUrl(null);
      setDuration(null);
      setProbing(false);
    } else {
      setLinkInfo(null);
      setLinkState("idle");
      setLinkError(null);
    }
  }

  useEffect(() => {
    if (mode !== "link") return;
    const trimmed = link.trim();
    if (!trimmed) {
      setLinkInfo(null);
      setLinkState("idle");
      setLinkError(null);
      return;
    }
    let cancelled = false;
    setLinkInfo(null);
    setLinkState("checking");
    setLinkError(null);
    const timer = setTimeout(async () => {
      const videoId = parseYoutubeId(trimmed);
      if (cancelled) return;
      if (videoId) {
        setLinkInfo({ kind: "youtube", videoId });
        setLinkState("ok");
        return;
      }
      let parsed: URL | null = null;
      try {
        parsed = new URL(trimmed);
      } catch {
        parsed = null;
      }
      if (!parsed || !/^https?:$/.test(parsed.protocol)) {
        setLinkState("error");
        setLinkError("Paste a full video URL starting with https://.");
        return;
      }
      const duration = await readVideoUrlDuration(trimmed);
      if (cancelled) return;
      if (duration === null) {
        setLinkState("error");
        setLinkError("This browser could not play that link. Use a YouTube link or a direct MP4/WebM URL.");
        return;
      }
      setLinkInfo({ kind: "url", url: trimmed, duration });
      setLinkState("ok");
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [mode, link]);

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
    const useFile = mode === "file";
    if (useFile) {
      if (!file || !url || duration === null) {
        setError("Choose a video file first.");
        return;
      }
    } else if (!linkInfo) {
      setError(linkState === "checking" ? "Still checking that link — give it a second." : "Paste a valid video link first.");
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
    if (useFile && keepVideo && file) {
      try {
        await putVideo(id, file);
        stored = true;
      } catch (e) {
        toast.warning(`Couldn't keep the video in this browser (${(e as Error).message}). Tags will still be saved — reattach the file next time.`);
      }
    }
    const chosenLink = linkInfo as LinkInfo | null;
    const source: VideoSource = useFile
      ? { kind: "upload", url: url! }
      : chosenLink!.kind === "youtube"
        ? { kind: "youtube", videoId: chosenLink!.videoId }
        : { kind: "upload", url: chosenLink!.url };
    const videoName = useFile
      ? file!.name
      : chosenLink!.kind === "youtube"
        ? `YouTube · ${chosenLink!.videoId}`
        : new URL(chosenLink!.url).hostname;
    const record: MatchAnalysis = {
      id,
      title: title.trim() || videoName,
      date,
      opponent: opponent.trim(),
      event_name: eventName.trim(),
      fps: effectiveFps,
      fps_source: effectiveSource,
      duration_sec: useFile ? duration : chosenLink!.kind === "url" ? chosenLink!.duration : null,
      video_name: videoName,
      video_url: useFile ? null : link.trim(),
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
    onCreated(record, source);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-lg uppercase tracking-wide">New match analysis</CardTitle>
        <CardDescription>
          Upload a file or paste a YouTube/direct video link. Tag exchanges as you watch — tags are saved locally.
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

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label>Video source</Label>
            <div className="inline-flex rounded-md bg-muted p-0.5" role="group" aria-label="Video source">
              {(["file", "link"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => switchMode(option)}
                  className={cn(
                    "rounded px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors",
                    mode === option && "bg-accent text-foreground",
                  )}
                >
                  {option === "file" ? "Upload file" : "Paste link"}
                </button>
              ))}
            </div>
          </div>

          {mode === "file" ? (
            <div className="space-y-1.5">
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
                  {duration !== null ? ` · ${clock(duration)}` : ""}
                  {probing ? (
                    <span className="flex items-center gap-1">
                      <Loader2 className="size-3 animate-spin" /> reading frames…
                    </span>
                  ) : null}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              <Input
                id="match-link"
                type="url"
                inputMode="url"
                value={link}
                placeholder="https://youtube.com/watch?v=… or https://…/match.mp4"
                onChange={(e) => setLink(e.target.value)}
              />
              <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                {linkState === "checking" ? (
                  <>
                    <Loader2 className="mt-0.5 size-3 animate-spin shrink-0" /> Checking the link…
                  </>
                ) : linkState === "error" ? (
                  <span className="text-bad">{linkError}</span>
                ) : linkInfo?.kind === "youtube" ? (
                  <>
                    <Link2 className="mt-0.5 size-3 shrink-0" />
                    <span>
                      YouTube video <span className="font-mono text-foreground">{linkInfo.videoId}</span> — streams from YouTube.
                      Frame stepping is approximate and fps cannot be detected.
                    </span>
                  </>
                ) : linkInfo?.kind === "url" ? (
                  <>
                    <Link2 className="mt-0.5 size-3 shrink-0" />
                    <span>
                      Direct video · {clock(linkInfo.duration)} — streams from the source, nothing is downloaded.
                    </span>
                  </>
                ) : (
                  "Paste a YouTube link or a direct MP4/WebM link."
                )}
              </div>
            </div>
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
            ) : mode === "link" && linkInfo?.kind === "youtube" ? (
              "YouTube does not expose a frame rate. Set the source fps (often 30 or 60); stepping is approximate."
            ) : mode === "link" && linkInfo ? (
              "Set the video's real fps (usually 24, 25, 30, 50 or 60)."
            ) : file ? (
              "Frame rate could not be detected. Set the video's real fps (usually 24, 25, 30, 50 or 60)."
            ) : (
              "Frame-accurate stepping uses this value."
            )}
          </div>
        </div>

        {mode === "file" && (
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
        )}

        <p className="flex items-start gap-2 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          {mode === "file"
            ? "No upload happens. Files stay on this device; the tag data is structured for a later optional pose-tracking pass."
            : "Links stream straight from the source. Tags stay in this browser and are structured for a later optional pose-tracking pass."}
        </p>

        {error && (
          <p className="text-sm text-bad" role="alert">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={start}
            disabled={
              busy ||
              probing ||
              (mode === "file" ? !file || duration === null : !linkInfo)
            }
            className="font-semibold"
          >
            {busy ? <Loader2 className="animate-spin" /> : mode === "file" ? <Upload /> : <Link2 />}
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
