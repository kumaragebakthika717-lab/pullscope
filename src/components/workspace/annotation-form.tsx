"use client";

import { useEffect, useRef, useState } from "react";
import { ImageOff, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { RATING_COLORS, ROUND_OPTIONS, roundLabel } from "@/lib/constants";
import { formatTimecode } from "@/lib/timecode";
import type { PullerSide, Rating, RubricAttribute } from "@/lib/types";

export type FrameState =
  | { status: "capturing" }
  | { status: "ready"; blob: Blob; url: string }
  | { status: "existing"; url: string | null }
  | { status: "unavailable"; reason: "youtube" | "failed" }
  | { status: "none" };

export type AnnotationDraft = {
  attributeId: string;
  side: PullerSide;
  round: number;
  rating: Rating | null;
  note: string;
  timestamp: number;
};

type Props = {
  open: boolean;
  mode: "create" | "edit";
  initial: AnnotationDraft;
  frame: FrameState;
  attributes: RubricAttribute[];
  fps: number;
  leftName: string;
  rightName: string;
  onDiscardFrame: () => void;
  onSubmit: (draft: AnnotationDraft & { rating: Rating }) => void;
  onClose: () => void;
};

const RATINGS: { value: Rating; key: string; label: string; hint: string }[] = [
  { value: "green", key: "1", label: "Green", hint: "Good" },
  { value: "red", key: "2", label: "Red", hint: "Bad" },
  { value: "black", key: "3", label: "Black", hint: "Neutral" },
];

export function AnnotationForm(props: Props) {
  return (
    <Dialog open={props.open} onOpenChange={(o) => !o && props.onClose()}>
      {props.open && <FormBody key={`${props.mode}-${props.initial.timestamp}`} {...props} />}
    </Dialog>
  );
}

function FormBody({ mode, initial, frame, attributes, fps, leftName, rightName, onDiscardFrame, onSubmit }: Props) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const note = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!draft.attributeId && attributes[0]) setDraft((d) => ({ ...d, attributeId: attributes[0].id }));
  }, [attributes, draft.attributeId]);

  function setRating(r: Rating) {
    setDraft((d) => ({ ...d, rating: r }));
    setError(null);
    requestAnimationFrame(() => note.current?.focus());
  }

  function submit() {
    if (!draft.rating) {
      setError("Pick a rating — press 1, 2 or 3");
      return;
    }
    if (!draft.attributeId) {
      setError("Pick an attribute");
      return;
    }
    onSubmit({ ...draft, rating: draft.rating });
  }

  function onKeyDownCapture(e: React.KeyboardEvent) {
    const target = e.target as HTMLElement;
    const typing = target.tagName === "TEXTAREA" || target.tagName === "INPUT";
    if (e.ctrlKey || e.metaKey || e.altKey) {
      if (e.key === "Enter") {
        e.preventDefault();
        submit();
      }
      return;
    }
    if (!typing && ["1", "2", "3"].includes(e.key)) {
      e.preventDefault();
      e.stopPropagation();
      setRating(RATINGS[Number(e.key) - 1].value);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && (target.tagName === "TEXTAREA" || target === root.current)) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <DialogContent
      className="sm:max-w-xl"
      onOpenAutoFocus={(e) => {
        e.preventDefault();
        if (mode === "edit") note.current?.focus();
        else root.current?.focus();
      }}
    >
      <div ref={root} tabIndex={-1} onKeyDownCapture={onKeyDownCapture} className="space-y-4 outline-none">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-xl uppercase tracking-wide">
            {mode === "create" ? "New annotation" : "Edit annotation"}
            <span className="rounded bg-background px-2 py-0.5 font-mono text-sm font-normal normal-case tracking-normal text-brand">
              {formatTimecode(draft.timestamp, fps)}
            </span>
          </DialogTitle>
          <DialogDescription>
            <Kbd>1</Kbd>/<Kbd>2</Kbd>/<Kbd>3</Kbd> rating · type note · <Kbd>Enter</Kbd> save · <Kbd>Shift+Enter</Kbd> new line ·{" "}
            <Kbd>Esc</Kbd> cancel
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <div className="space-y-2">
            <Label>Attribute</Label>
            <Select value={draft.attributeId} onValueChange={(v) => setDraft({ ...draft, attributeId: v })}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose attribute" />
              </SelectTrigger>
              <SelectContent className="max-h-80">
                {attributes.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Puller</Label>
            <div className="flex rounded-md bg-background p-0.5">
              {(["left", "right"] as PullerSide[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setDraft({ ...draft, side: s })}
                  className={cn(
                    "max-w-36 truncate rounded px-3 py-1.5 text-sm text-muted-foreground",
                    draft.side === s && "bg-brand font-semibold text-black",
                  )}
                >
                  {s === "left" ? leftName : rightName}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Round</Label>
          <div className="flex flex-wrap gap-1">
            {ROUND_OPTIONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setDraft({ ...draft, round: r })}
                className={cn(
                  "rounded-md border px-3 py-1 text-sm text-muted-foreground hover:text-foreground",
                  draft.round === r && "border-brand bg-brand/15 text-foreground",
                )}
              >
                {roundLabel(r)}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Rating</Label>
          <div className="grid grid-cols-3 gap-2">
            {RATINGS.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setRating(r.value)}
                aria-pressed={draft.rating === r.value}
                className={cn(
                  "flex h-16 flex-col items-center justify-center rounded-lg border-2 text-sm font-semibold transition-all",
                  draft.rating === r.value ? "scale-[1.02] text-white" : "border-border text-muted-foreground hover:text-foreground",
                )}
                style={
                  draft.rating === r.value
                    ? { borderColor: RATING_COLORS[r.value], background: `${RATING_COLORS[r.value]}${r.value === "black" ? "" : "33"}` }
                    : undefined
                }
              >
                <span className="flex items-center gap-2">
                  <span className="size-3 rounded-full" style={{ background: RATING_COLORS[r.value], outline: r.value === "black" ? "1px solid #71717a" : undefined }} />
                  {r.label}
                </span>
                <span className="text-xs font-normal opacity-70">
                  {r.hint} · <Kbd>{r.key}</Kbd>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
          <div className="space-y-2">
            <Label htmlFor="note">Note</Label>
            <Textarea
              id="note"
              ref={note}
              rows={4}
              maxLength={2000}
              placeholder="What happened here?"
              value={draft.note}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Screenshot</Label>
            <FramePreview frame={frame} onDiscard={onDiscardFrame} />
          </div>
        </div>

        {error && <p className="text-sm text-bad" role="alert">{error}</p>}

        <div className="flex justify-end">
          <Button onClick={submit} className="font-semibold">
            {mode === "create" ? "Save annotation" : "Save changes"} <Kbd className="bg-black/20 text-inherit">Enter</Kbd>
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}

function FramePreview({ frame, onDiscard }: { frame: FrameState; onDiscard: () => void }) {
  const box = "relative grid aspect-video w-full place-items-center overflow-hidden rounded-md border bg-background text-center text-xs text-muted-foreground";
  if (frame.status === "capturing")
    return (
      <div className={box}>
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  if ((frame.status === "ready" || frame.status === "existing") && frame.url)
    return (
      <div className={box}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={frame.url} alt="Captured frame" className="size-full object-cover" />
        {frame.status === "ready" && (
          <button type="button" onClick={onDiscard} className="absolute top-1 right-1 rounded bg-black/70 p-0.5 hover:bg-black" aria-label="Discard screenshot">
            <X className="size-3.5" />
          </button>
        )}
      </div>
    );
  return (
    <div className={cn(box, "p-2")}>
      <div className="space-y-1">
        <ImageOff className="mx-auto size-4" />
        <p>
          {frame.status === "unavailable" && frame.reason === "youtube"
            ? "Screenshots are available for uploaded videos. YouTube frames can't be captured."
            : frame.status === "unavailable"
              ? "Couldn't capture this frame. The note still saves."
              : "No screenshot"}
        </p>
      </div>
    </div>
  );
}

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd className={cn("rounded border border-border bg-background px-1 py-px font-mono text-[10px] font-normal text-muted-foreground", className)}>
      {children}
    </kbd>
  );
}
