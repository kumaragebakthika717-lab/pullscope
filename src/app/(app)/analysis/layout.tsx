import type { Metadata } from "next";
import { AnalysisNav } from "@/components/analysis/analysis-nav";

export const metadata: Metadata = { title: "Performance analysis" };

export default function AnalysisLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <AnalysisNav />
      {children}
    </div>
  );
}
