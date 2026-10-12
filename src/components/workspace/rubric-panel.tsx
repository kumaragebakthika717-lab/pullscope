"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Plus, Settings2 } from "lucide-react";
import { RATING_COLORS } from "@/lib/constants";
import { computeVerdict } from "@/lib/verdict";
import type { AnnotationWithFrame, Rating, RubricAttribute } from "@/lib/types";

type Props = {
  attributes: RubricAttribute[];
  annotations: AnnotationWithFrame[];
  onQuickAnnotate: (attributeId: string) => void;
};

/** Annotations passed in are already filtered to the active puller. */
export function RubricPanel({ attributes, annotations, onQuickAnnotate }: Props) {
  const stats = useMemo(() => {
    const m = new Map<string, { counts: Record<Rating, number>; verdict: ReturnType<typeof computeVerdict> }>();
    for (const attr of attributes) {
      const list = annotations.filter((a) => a.attribute_id === attr.id);
      const counts = { green: 0, red: 0, black: 0 };
      list.forEach((a) => counts[a.rating]++);
      m.set(attr.id, { counts, verdict: computeVerdict(list) });
    }
    return m;
  }, [attributes, annotations]);

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-3 py-2">
        <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Rubric</h3>
        <Link href="/settings/rubric" className="text-muted-foreground hover:text-foreground" title="Edit rubric">
          <Settings2 className="size-3.5" />
        </Link>
      </div>
      <ul>
        {attributes.map((a) => {
          const s = stats.get(a.id)!;
          return (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => onQuickAnnotate(a.id)}
                className="group flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent"
                title={a.description ?? `Annotate ${a.name}`}
              >
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{
                    background: s.verdict === "unrated" ? "transparent" : RATING_COLORS[s.verdict],
                    border: s.verdict === "unrated" ? "1px dashed #52525b" : undefined,
                  }}
                />
                <span className="min-w-0 flex-1 truncate">{a.name}</span>
                <span className="flex gap-1 font-mono text-[10px] text-muted-foreground group-hover:hidden">
                  {(["green", "red", "black"] as Rating[]).map((r) =>
                    s.counts[r] ? (
                      <span key={r} style={{ color: r === "black" ? "#a1a1aa" : RATING_COLORS[r] }}>
                        {s.counts[r]}
                      </span>
                    ) : null,
                  )}
                </span>
                <Plus className="hidden size-3.5 text-brand group-hover:block" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
