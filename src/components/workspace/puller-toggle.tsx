"use client";

import { cn } from "@/lib/utils";
import { ROUND_OPTIONS, roundLabel } from "@/lib/constants";
import type { PullerSide } from "@/lib/types";
import { Kbd } from "./annotation-form";

export type RoundFilter = "all" | number;

type Props = {
  side: PullerSide;
  onSide: (s: PullerSide) => void;
  leftName: string;
  rightName: string;
  counts: Record<PullerSide, number>;
  round: RoundFilter;
  onRound: (r: RoundFilter) => void;
};

export function PullerToggle({ side, onSide, leftName, rightName, counts, round, onRound }: Props) {
  return (
    <div className="space-y-4 p-3">
      <div className="space-y-2">
        <h3 className="flex items-center justify-between text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Active puller <Kbd>Tab</Kbd>
        </h3>
        <div className="grid grid-cols-2 gap-1 rounded-md bg-background p-1" role="radiogroup" aria-label="Active puller">
          {(["left", "right"] as PullerSide[]).map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={side === s}
              onClick={() => onSide(s)}
              className={cn(
                "min-w-0 rounded px-2 py-2 text-left text-sm text-muted-foreground transition-colors",
                side === s && "bg-brand text-black",
              )}
            >
              <span className="block text-[10px] font-semibold tracking-wider uppercase opacity-70">{s}</span>
              <span className="block truncate font-semibold">{s === "left" ? leftName : rightName}</span>
              <span className="block text-xs opacity-70">{counts[s]} notes</span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Round filter</h3>
        <div className="flex flex-wrap gap-1">
          {(["all", ...ROUND_OPTIONS] as RoundFilter[]).map((r) => (
            <button
              key={String(r)}
              type="button"
              onClick={() => onRound(r)}
              className={cn(
                "rounded border px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground",
                round === r && "border-brand bg-brand/15 text-foreground",
              )}
            >
              {r === "all" ? "All" : roundLabel(r).replace("Round ", "R")}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5 text-xs text-muted-foreground">
        <h3 className="font-semibold tracking-wider uppercase">Shortcuts</h3>
        {[
          ["Space", "Play / pause"],
          ["← →", "Seek ±1s"],
          [", .", "Frame step"],
          ["A", "Annotate"],
          ["1 2 3", "Green / red / black"],
          ["Tab", "Switch puller"],
          ["Esc", "Close form"],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between">
            <span>{v}</span>
            <Kbd>{k}</Kbd>
          </div>
        ))}
      </div>
    </div>
  );
}
