import type { Metadata } from "next";
import { SpeedWorkspace } from "@/components/analysis/speed-workspace";

export const metadata: Metadata = { title: "Speed & endurance" };

export default function SpeedAnalysisPage() {
  return <SpeedWorkspace />;
}
