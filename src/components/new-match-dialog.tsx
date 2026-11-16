"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Film, Loader2, Plus, MonitorPlay } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createMatch, getYoutubeMeta } from "@/app/actions/matches";
import { parseYoutubeId, youtubeThumbnail } from "@/lib/youtube";
import { uploadMatchVideo, validateVideoFile } from "@/lib/upload";
import { UpgradePrompt } from "@/components/upgrade-prompt";

export function NewMatchDialog({ atLimit }: { atLimit: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<"youtube" | "upload">("youtube");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [eventName, setEventName] = useState("");
  const [left, setLeft] = useState("");
  const [right, setRight] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileDuration, setFileDuration] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limitHit, setLimitHit] = useState(false);
  const [busy, setBusy] = useState<null | "creating" | "uploading" | "processing">(null);
  const [progress, setProgress] = useState(0);
  const [meta, setMeta] = useState<{ title: string } | null>(null);
  const titleTouched = useRef(false);

  const videoId = source === "youtube" ? parseYoutubeId(url) : null;

  useEffect(() => {
    if (!videoId) {
      setMeta(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      const res = await getYoutubeMeta(videoId);
      if (cancelled) return;
      if (res.ok) {
        setMeta({ title: res.data.title });
        if (!titleTouched.current) setTitle(res.data.title.slice(0, 200));
      } else {
        setMeta(null);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [videoId]);

  function reset() {
    setUrl("");
    setTitle("");
    setEventName("");
    setLeft("");
    setRight("");
    setFile(null);
    setFileDuration(null);
    setError(null);
    setLimitHit(false);
    setBusy(null);
    setProgress(0);
    setMeta(null);
    titleTouched.current = false;
  }

  async function onFile(f: File | null) {
    setError(null);
    setFile(null);
    if (!f) return;
    const v = await validateVideoFile(f);
    if (!v.ok) return setError(v.error);
    setFile(f);
    setFileDuration(v.duration);
    if (!titleTouched.current && !title) setTitle(f.name.replace(/\.mp4$/i, "").slice(0, 200));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (source === "youtube" && !videoId) return setError("Paste a valid YouTube link");
    if (source === "upload" && !file) return setError("Choose an MP4 file");

    setBusy("creating");
    let res: Awaited<ReturnType<typeof createMatch>>;
    try {
      res = await createMatch({
        title,
        event_name: eventName || null,
        left_puller: left,
        right_puller: right,
        source_type: source,
        youtube_id: videoId,
      });
    } catch (err) {
      setBusy(null);
      return setError(
        (err as Error)?.name === "TypeError"
          ? "Cannot reach the server. If this is the dev server, it has stopped — restart npm run dev."
          : (err as Error).message,
      );
    }
    if (!res.ok) {
      setBusy(null);
      if (res.code === "free_tier_limit") return setLimitHit(true);
      return setError(res.error);
    }

    if (source === "upload" && file) {
      try {
        setBusy("uploading");
        await uploadMatchVideo(res.data.id, file, fileDuration, (p) => {
          setProgress(p);
          if (p >= 100) setBusy("processing");
        });
      } catch (err) {
        toast.error(`${(err as Error).message}. You can retry the upload from the match page.`);
      }
    }
    router.push(`/match/${res.data.id}`);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (busy) return;
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button className="font-semibold">
          <Plus /> New Match
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-xl uppercase tracking-wide">New match</DialogTitle>
          <DialogDescription>Paste a YouTube link or upload an MP4 (max 500 MB / 30 min).</DialogDescription>
        </DialogHeader>

        {atLimit || limitHit ? (
          <UpgradePrompt />
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <Tabs value={source} onValueChange={(v) => setSource(v as "youtube" | "upload")}>
              <TabsList className="w-full">
                <TabsTrigger value="youtube" className="flex-1">
                  <MonitorPlay /> YouTube link
                </TabsTrigger>
                <TabsTrigger value="upload" className="flex-1">
                  <Film /> Upload MP4
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {source === "youtube" ? (
              <div className="space-y-2">
                <Label htmlFor="yt">YouTube URL</Label>
                <Input
                  id="yt"
                  autoFocus
                  placeholder="https://www.youtube.com/watch?v=…"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
                {videoId && (
                  <div className="flex items-center gap-3 rounded-md border bg-background p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={youtubeThumbnail(videoId)} alt="" className="h-12 w-20 rounded object-cover" />
                    <span className="line-clamp-2 text-xs text-muted-foreground">{meta?.title ?? "Loading video info…"}</span>
                  </div>
                )}
                {url && !videoId && <p className="text-xs text-bad">Not a recognised YouTube link.</p>}
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="file">Video file</Label>
                <Input id="file" type="file" accept="video/mp4" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
                {file && (
                  <p className="text-xs text-muted-foreground">
                    {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                required
                maxLength={200}
                value={title}
                onChange={(e) => {
                  titleTouched.current = true;
                  setTitle(e.target.value);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="event">Event (optional)</Label>
              <Input id="event" maxLength={200} placeholder="e.g. East vs West 17" value={eventName} onChange={(e) => setEventName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="left">Left puller</Label>
                <Input id="left" required maxLength={100} value={left} onChange={(e) => setLeft(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="right">Right puller</Label>
                <Input id="right" required maxLength={100} value={right} onChange={(e) => setRight(e.target.value)} />
              </div>
            </div>

            {error && <p className="text-sm text-bad" role="alert">{error}</p>}
            {busy === "uploading" && (
              <div className="space-y-1">
                <div className="h-2 overflow-hidden rounded bg-muted">
                  <div className="h-full bg-brand transition-all" style={{ width: `${progress}%` }} />
                </div>
                <p className="text-xs text-muted-foreground">Uploading… {progress}%</p>
              </div>
            )}

            <DialogFooter>
              <Button type="submit" disabled={!!busy} className="font-semibold">
                {busy && <Loader2 className="animate-spin" />}
                {busy === "uploading"
                  ? "Uploading…"
                  : busy === "processing"
                    ? "Reading video metadata…"
                    : busy
                      ? "Creating…"
                      : "Create match"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
