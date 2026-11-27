import type { Metadata } from "next";
import { MatchesWorkspace } from "@/components/analysis/matches/matches-workspace";

export const metadata: Metadata = { title: "Match tagging" };

export default function MatchAnalysisPage() {
  return <MatchesWorkspace />;
}
