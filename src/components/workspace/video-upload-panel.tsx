"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { uploadMatchVideo, validateVideoFile } from "@/lib/upload";

export function VideoUploadPanel({ matchId }: { matchId: string }) {
  const router = useRouter();
  const [progress, setProgress] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  async function handle(file: File | undefined) {
    if (!file || progress !== null) return;
    const v = await validateVideoFile(file);
    if (!v.ok) return toast.error(v.error);
    setProgress(0);
    try {
      const res = await uploadMatchVideo(matchId, file, v.duration, setProgress);
      if (!res.probed) toast.info("Couldn't read the exact frame rate; using 30fps.");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
      setProgress(null);
    }
  }

  return (
    <label
      className={`grid aspect-video w-full cursor-pointer place-items-center rounded-lg border-2 border-dashed bg-panel text-center transition-colors ${dragging ? "border-brand bg-brand/5" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void handle(e.dataTransfer.files[0]);
      }}
    >
      <input type="file" accept="video/mp4" className="sr-only" onChange={(e) => void handle(e.target.files?.[0])} />
      {progress === null ? (
        <div className="space-y-2">
          <Upload className="mx-auto size-8 text-brand" />
          <p className="font-semibold">Upload the match video</p>
          <p className="text-sm text-muted-foreground">Drop an MP4 here or click to choose · max 500 MB / 30 min</p>
        </div>
      ) : (
        <div className="w-64 space-y-2">
          <Loader2 className="mx-auto size-6 animate-spin text-brand" />
          <div className="h-2 overflow-hidden rounded bg-muted">
            <div className="h-full bg-brand transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-sm text-muted-foreground">{progress < 100 ? `Uploading… ${progress}%` : "Reading video metadata…"}</p>
        </div>
      )}
    </label>
  );
}
