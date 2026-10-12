"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createAnnotation, deleteAnnotation, listAnnotations, updateAnnotation } from "@/app/actions/annotations";
import { deleteRoundBoundary, listRoundBoundaries, markRoundBoundary } from "@/app/actions/rounds";
import { setMatchDuration } from "@/app/actions/matches";
import { uploadFrame } from "@/lib/upload";
import { createTimeStore } from "@/lib/time-store";
import { DEFAULT_FPS } from "@/lib/constants";
import type { AnnotationWithFrame, Match, PullerSide, RoundBoundary, RubricAttribute } from "@/lib/types";
import { VideoPlayer, type PlayerHandle, type VideoSource } from "./video-player";
import { Timeline } from "./timeline";
import { AnnotationForm, type AnnotationDraft, type FrameState } from "./annotation-form";
import { AnnotationList } from "./annotation-list";
import { RubricPanel } from "./rubric-panel";
import { PullerToggle, type RoundFilter } from "./puller-toggle";
import { VideoUploadPanel } from "./video-upload-panel";

type Props = {
  match: Match;
  userId: string;
  attributes: RubricAttribute[];
  initialAnnotations: AnnotationWithFrame[];
  initialRounds: RoundBoundary[];
  videoUrl: string | null;
};

type FormState =
  | { open: false }
  | { open: true; mode: "create"; initial: AnnotationDraft }
  | { open: true; mode: "edit"; initial: AnnotationDraft; annotation: AnnotationWithFrame };

function isTypingTarget(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.getAttribute("role") === "combobox";
}

export function Workspace({ match, userId, attributes, initialAnnotations, initialRounds, videoUrl }: Props) {
  const qc = useQueryClient();
  const player = useRef<PlayerHandle>(null);
  const [timeStore] = useState(createTimeStore);
  const fps = match.fps || DEFAULT_FPS;
  const [duration, setDuration] = useState(match.duration_sec ?? 0);
  const [side, setSide] = useState<PullerSide>("left");
  const [roundFilter, setRoundFilter] = useState<RoundFilter>("all");
  const [form, setForm] = useState<FormState>({ open: false });
  const [frame, setFrame] = useState<FrameState>({ status: "none" });
  const last = useRef<{ attributeId: string; round: number }>({ attributeId: attributes[0]?.id ?? "", round: 1 });

  const annKey = useMemo(() => ["annotations", match.id], [match.id]);
  const roundKey = useMemo(() => ["rounds", match.id], [match.id]);

  const { data: annotations = [] } = useQuery({
    queryKey: annKey,
    queryFn: () => listAnnotations(match.id),
    initialData: initialAnnotations,
  });
  const { data: rounds = [] } = useQuery({
    queryKey: roundKey,
    queryFn: () => listRoundBoundaries(match.id),
    initialData: initialRounds,
  });

  const source = useMemo<VideoSource | null>(() => {
    if (match.source_type === "youtube" && match.youtube_id) return { kind: "youtube", videoId: match.youtube_id };
    if (match.source_type === "upload" && videoUrl) return { kind: "upload", url: videoUrl };
    return null;
  }, [match.source_type, match.youtube_id, videoUrl]);

  const onDuration = useCallback(
    (d: number) => {
      setDuration(d);
      if (!match.duration_sec || Math.abs(match.duration_sec - d) > 0.5) void setMatchDuration(match.id, d);
    },
    [match.id, match.duration_sec],
  );

  // ---------- mutations ----------
  const createMut = useMutation({
    mutationFn: async (v: { draft: AnnotationDraft & { rating: NonNullable<AnnotationDraft["rating"]> }; blob: Blob | null; tempId: string }) => {
      let frame_path: string | null = null;
      if (v.blob) {
        try {
          frame_path = await uploadFrame(userId, match.id, v.blob);
        } catch (e) {
          toast.warning(`Screenshot upload failed (${(e as Error).message}); annotation saved without it.`);
        }
      }
      const res = await createAnnotation({
        match_id: match.id,
        attribute_id: v.draft.attributeId,
        puller_side: v.draft.side,
        round_number: v.draft.round,
        timestamp_sec: v.draft.timestamp,
        rating: v.draft.rating,
        note: v.draft.note,
        frame_path,
      });
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    onMutate: ({ draft, tempId }) => {
      const optimistic: AnnotationWithFrame = {
        id: tempId,
        match_id: match.id,
        attribute_id: draft.attributeId,
        puller_side: draft.side,
        round_number: draft.round,
        timestamp_sec: draft.timestamp,
        rating: draft.rating,
        note: draft.note.trim() || null,
        frame_path: null,
        frame_url: frame.status === "ready" ? frame.url : null,
        created_at: new Date().toISOString(),
      };
      qc.setQueryData<AnnotationWithFrame[]>(annKey, (old = []) => [...old, optimistic]);
    },
    onSuccess: (row, { tempId }) => {
      qc.setQueryData<AnnotationWithFrame[]>(annKey, (old = []) => old.map((a) => (a.id === tempId ? row : a)));
    },
    onError: (e, { tempId }) => {
      qc.setQueryData<AnnotationWithFrame[]>(annKey, (old = []) => old.filter((a) => a.id !== tempId));
      toast.error(`Couldn't save annotation: ${(e as Error).message}`);
    },
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, draft }: { id: string; draft: AnnotationDraft & { rating: NonNullable<AnnotationDraft["rating"]> } }) => {
      const res = await updateAnnotation(id, {
        attribute_id: draft.attributeId,
        puller_side: draft.side,
        round_number: draft.round,
        rating: draft.rating,
        note: draft.note,
      });
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    onSuccess: (row) => qc.setQueryData<AnnotationWithFrame[]>(annKey, (old = []) => old.map((a) => (a.id === row.id ? row : a))),
    onError: (e) => toast.error(`Couldn't update: ${(e as Error).message}`),
  });

  const deleteMut = useMutation({
    mutationFn: async (a: AnnotationWithFrame) => {
      const res = await deleteAnnotation(a.id);
      if (!res.ok) throw new Error(res.error);
    },
    onMutate: (a) => {
      const prev = qc.getQueryData<AnnotationWithFrame[]>(annKey);
      qc.setQueryData<AnnotationWithFrame[]>(annKey, (old = []) => old.filter((x) => x.id !== a.id));
      return { prev };
    },
    onError: (e, _a, ctx) => {
      if (ctx?.prev) qc.setQueryData(annKey, ctx.prev);
      toast.error(`Couldn't delete: ${(e as Error).message}`);
    },
  });

  // ---------- actions ----------
  const suggestRound = useCallback(
    (t: number) => {
      if (!rounds.length) return last.current.round;
      let r = 1;
      for (const b of rounds) if (b.start_sec <= t + 1e-3) r = b.round_number;
      return r;
    },
    [rounds],
  );

  const openCreate = useCallback(
    async (attributeId?: string) => {
      const p = player.current;
      if (!p || !attributes.length) {
        if (!attributes.length) toast.error("Your rubric is empty — add attributes first.");
        return;
      }
      p.pause();
      const t = p.getCurrentTime();
      setForm({
        open: true,
        mode: "create",
        initial: {
          attributeId: attributeId ?? last.current.attributeId ?? attributes[0].id,
          side,
          round: suggestRound(t),
          rating: null,
          note: "",
          timestamp: t,
        },
      });
      if (!p.canCapture) {
        setFrame({ status: "unavailable", reason: "youtube" });
        return;
      }
      setFrame({ status: "capturing" });
      const blob = await p.captureFrame();
      setFrame(blob ? { status: "ready", blob, url: URL.createObjectURL(blob) } : { status: "unavailable", reason: "failed" });
    },
    [attributes, side, suggestRound],
  );

  const openEdit = useCallback((a: AnnotationWithFrame) => {
    player.current?.pause();
    setFrame({ status: "existing", url: a.frame_url });
    setForm({
      open: true,
      mode: "edit",
      annotation: a,
      initial: {
        attributeId: a.attribute_id,
        side: a.puller_side,
        round: a.round_number,
        rating: a.rating,
        note: a.note ?? "",
        timestamp: a.timestamp_sec,
      },
    });
  }, []);

  function closeForm() {
    setForm({ open: false });
  }

  function submitForm(draft: AnnotationDraft & { rating: NonNullable<AnnotationDraft["rating"]> }) {
    if (!form.open) return;
    last.current = { attributeId: draft.attributeId, round: draft.round };
    if (form.mode === "create") {
      createMut.mutate({ draft, blob: frame.status === "ready" ? frame.blob : null, tempId: `temp-${crypto.randomUUID()}` });
      setSide(draft.side);
    } else {
      updateMut.mutate({ id: form.annotation.id, draft });
    }
    closeForm();
  }

  const seekTo = useCallback((t: number, pause = false) => {
    if (pause) player.current?.pause();
    player.current?.seek(t);
  }, []);

  async function markRound() {
    const t = player.current?.getCurrentTime() ?? 0;
    const res = await markRoundBoundary(match.id, t);
    if (!res.ok) return toast.error(res.error);
    qc.setQueryData(roundKey, res.data);
    toast.success(`Round boundary marked at ${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`);
  }

  async function removeRound(r: RoundBoundary) {
    if (!confirm(`Remove the Round ${r.round_number} marker? Later rounds will be renumbered.`)) return;
    const res = await deleteRoundBoundary(match.id, r.id);
    if (!res.ok) return toast.error(res.error);
    qc.setQueryData(roundKey, res.data);
  }

  // ---------- keyboard ----------
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (form.open || e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector("[role=dialog], [role=alertdialog]")) return;
      if (isTypingTarget(e.target)) return;
      const p = player.current;
      if (!p) return;
      switch (e.key) {
        case " ":
          e.preventDefault();
          p.toggle();
          break;
        case "ArrowLeft":
          e.preventDefault();
          p.seekBy(-1);
          break;
        case "ArrowRight":
          e.preventDefault();
          p.seekBy(1);
          break;
        case ",":
        case "<":
          e.preventDefault();
          p.stepFrame(-1);
          break;
        case ".":
        case ">":
          e.preventDefault();
          p.stepFrame(1);
          break;
        case "a":
        case "A":
          e.preventDefault();
          void openCreate();
          break;
        case "Tab":
          e.preventDefault();
          setSide((s) => (s === "left" ? "right" : "left"));
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [form.open, openCreate]);

  // ---------- derived ----------
  const sideAnnotations = useMemo(() => annotations.filter((a) => a.puller_side === side), [annotations, side]);
  const listAnnotationsFiltered = useMemo(
    () => (roundFilter === "all" ? sideAnnotations : sideAnnotations.filter((a) => a.round_number === roundFilter)),
    [sideAnnotations, roundFilter],
  );
  const counts = useMemo(
    () => ({
      left: annotations.filter((a) => a.puller_side === "left").length,
      right: annotations.filter((a) => a.puller_side === "right").length,
    }),
    [annotations],
  );
  const pullerName = side === "left" ? match.left_puller : match.right_puller;

  return (
    <div className="mx-auto w-full max-w-[1800px] space-y-3 p-3">
      <div className="mx-auto w-full max-w-[min(100%,calc(58vh*16/9))]">
        {source ? (
          <VideoPlayer ref={player} source={source} fps={fps} timeStore={timeStore} onDuration={onDuration} />
        ) : (
          <VideoUploadPanel matchId={match.id} />
        )}
      </div>

      <Timeline
        annotations={annotations}
        attributes={attributes}
        rounds={rounds}
        duration={duration}
        fps={fps}
        timeStore={timeStore}
        leftName={match.left_puller}
        rightName={match.right_puller}
        activeSide={side}
        onSeek={(t) => seekTo(t)}
        onMarkRound={markRound}
        onDeleteRound={removeRound}
      />

      <div className="grid gap-3 lg:grid-cols-[260px_minmax(0,1fr)_260px]">
        <div className="max-h-[50vh] overflow-y-auto rounded-lg border bg-panel lg:max-h-[calc(100vh-4rem)]">
          <RubricPanel attributes={attributes} annotations={sideAnnotations} onQuickAnnotate={(id) => void openCreate(id)} />
        </div>
        <div className="flex max-h-[60vh] flex-col overflow-hidden rounded-lg border bg-panel lg:max-h-[calc(100vh-4rem)]">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Annotations · <span className="text-foreground">{pullerName}</span>
            </h3>
            <button
              type="button"
              onClick={() => void openCreate()}
              className="rounded-md bg-brand px-2.5 py-1 text-xs font-semibold text-black hover:bg-brand/90"
              disabled={!source}
            >
              + Annotate <span className="opacity-60">(A)</span>
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <AnnotationList
              annotations={listAnnotationsFiltered}
              attributes={attributes}
              fps={fps}
              pullerName={pullerName}
              onSeek={(a) => seekTo(a.timestamp_sec, true)}
              onEdit={openEdit}
              onDelete={(a) => {
                if (confirm("Delete this annotation?")) deleteMut.mutate(a);
              }}
            />
          </div>
        </div>
        <div className="rounded-lg border bg-panel">
          <PullerToggle
            side={side}
            onSide={setSide}
            leftName={match.left_puller}
            rightName={match.right_puller}
            counts={counts}
            round={roundFilter}
            onRound={setRoundFilter}
          />
        </div>
      </div>

      <AnnotationForm
        open={form.open}
        mode={form.open ? form.mode : "create"}
        initial={form.open ? form.initial : { attributeId: "", side, round: 1, rating: null, note: "", timestamp: 0 }}
        frame={frame}
        attributes={attributes}
        fps={fps}
        leftName={match.left_puller}
        rightName={match.right_puller}
        onDiscardFrame={() => setFrame({ status: "none" })}
        onSubmit={submitForm}
        onClose={closeForm}
      />
    </div>
  );
}
