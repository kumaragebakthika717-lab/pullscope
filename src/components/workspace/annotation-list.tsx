"use client";

import { useMemo } from "react";
import { ImageIcon, MessageSquarePlus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RATING_COLORS, roundLabel } from "@/lib/constants";
import { formatTimecode } from "@/lib/timecode";
import type { AnnotationWithFrame, RubricAttribute } from "@/lib/types";

type Props = {
  annotations: AnnotationWithFrame[];
  attributes: RubricAttribute[];
  fps: number;
  pullerName: string;
  onSeek: (a: AnnotationWithFrame) => void;
  onEdit: (a: AnnotationWithFrame) => void;
  onDelete: (a: AnnotationWithFrame) => void;
};

export function AnnotationList({ annotations, attributes, fps, pullerName, onSeek, onEdit, onDelete }: Props) {
  const groups = useMemo(() => {
    const order = new Map(attributes.map((a, i) => [a.id, i]));
    const byAttr = new Map<string, AnnotationWithFrame[]>();
    for (const a of annotations) {
      const list = byAttr.get(a.attribute_id) ?? [];
      list.push(a);
      byAttr.set(a.attribute_id, list);
    }
    return [...byAttr.entries()]
      .map(([id, list]) => ({
        id,
        name: attributes.find((x) => x.id === id)?.name ?? "Removed attribute",
        list: list.sort((x, y) => x.timestamp_sec - y.timestamp_sec),
      }))
      .sort((x, y) => (order.get(x.id) ?? 999) - (order.get(y.id) ?? 999));
  }, [annotations, attributes]);

  if (!annotations.length) {
    return (
      <div className="grid h-full min-h-40 place-items-center p-6 text-center text-sm text-muted-foreground">
        <div className="space-y-2">
          <MessageSquarePlus className="mx-auto size-6" />
          <p>No annotations for {pullerName} yet.</p>
          <p className="text-xs">
            Press <kbd className="rounded border px-1 font-mono">A</kbd> at any moment to annotate.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="divide-y">
      {groups.map((g) => (
        <section key={g.id} className="py-2">
          <h4 className="px-3 pb-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            {g.name} <span className="font-normal">({g.list.length})</span>
          </h4>
          <ul>
            {g.list.map((a) => (
              <li key={a.id} className={`group flex items-start gap-2 px-3 py-1.5 hover:bg-accent ${a.id.startsWith("temp-") ? "opacity-60" : ""}`}>
                <button type="button" onClick={() => onSeek(a)} className="flex min-w-0 flex-1 items-start gap-2 text-left" title="Jump to this moment">
                  <span className="mt-1 size-3 shrink-0 rounded-full ring-1 ring-white/20" style={{ background: RATING_COLORS[a.rating] }} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 font-mono text-xs">
                      <span className="text-brand">{formatTimecode(a.timestamp_sec, fps)}</span>
                      <span className="text-muted-foreground">{roundLabel(a.round_number)}</span>
                    </span>
                    <span className="line-clamp-2 text-sm">{a.note || <em className="text-muted-foreground">No note</em>}</span>
                  </span>
                  {a.frame_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.frame_url} alt="" className="h-10 w-16 shrink-0 rounded object-cover" loading="lazy" />
                  ) : a.frame_path ? (
                    <span className="grid h-10 w-16 shrink-0 place-items-center rounded bg-background">
                      <ImageIcon className="size-3.5 text-muted-foreground" />
                    </span>
                  ) : null}
                </button>
                <div className="flex shrink-0 flex-col opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                  <Button size="icon-xs" variant="ghost" aria-label="Edit annotation" onClick={() => onEdit(a)} disabled={a.id.startsWith("temp-")}>
                    <Pencil />
                  </Button>
                  <Button size="icon-xs" variant="ghost" aria-label="Delete annotation" className="hover:text-bad" onClick={() => onDelete(a)} disabled={a.id.startsWith("temp-")}>
                    <Trash2 />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
