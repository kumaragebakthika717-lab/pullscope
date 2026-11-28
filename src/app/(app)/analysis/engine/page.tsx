import type { Metadata } from "next";
import { TechnicalityWorkspace } from "@/components/analysis/technicality-workspace";

export const metadata: Metadata = { title: "Technicality engine" };

export default function TechnicalityEnginePage() {
  return <TechnicalityWorkspace />;
}