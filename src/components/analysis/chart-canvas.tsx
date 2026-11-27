"use client";

import { useEffect, useRef } from "react";
import { Chart, type ChartConfiguration } from "chart.js/auto";
import { cn } from "@/lib/utils";

Chart.defaults.color = "#a1a1aa";
Chart.defaults.borderColor = "rgba(255, 255, 255, 0.08)";
Chart.defaults.font.family = "Inter, ui-sans-serif, system-ui, sans-serif";
Chart.defaults.font.size = 11;

export function ChartCanvas({
  config,
  ariaLabel,
  className,
}: {
  /** Memoize this in the caller; a new object recreates the chart. */
  config: ChartConfiguration;
  ariaLabel: string;
  className?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const chart = useRef<Chart | null>(null);

  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    chart.current?.destroy();
    chart.current = new Chart(ctx, config);
    return () => {
      chart.current?.destroy();
      chart.current = null;
    };
  }, [config]);

  return (
    <div className={cn("relative h-56 w-full", className)}>
      <canvas ref={canvas} role="img" aria-label={ariaLabel} />
    </div>
  );
}
