"use client";

import { useState } from "react";
import { Check, Copy, Download, ExternalLink, FileBarChart2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { generateReportCard } from "@/app/actions/cards";

export function ExportCardButton({ matchId, initialSlug }: { matchId: string; initialSlug: string | null }) {
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState(initialSlug);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  // Cache-buster so a regenerated PNG reflects the latest annotations.
  const [version, setVersion] = useState(() => Date.now());

  async function generate() {
    setBusy(true);
    const res = await generateReportCard(matchId);
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    setSlug(res.data.slug);
    setVersion(Date.now());
    setOpen(true);
  }

  const url = slug ? `${process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || (typeof window !== "undefined" ? window.location.origin : "")}/card/${slug}` : "";

  return (
    <>
      <Button onClick={generate} disabled={busy} className="font-semibold">
        {busy ? <Loader2 className="animate-spin" /> : <FileBarChart2 />}
        {slug ? "Report Card" : "Generate Report Card"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-xl uppercase tracking-wide">Report card ready</DialogTitle>
            <DialogDescription>Anyone with the link can view it. It always reflects your latest annotations.</DialogDescription>
          </DialogHeader>
          {slug && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
                <Button
                  variant="outline"
                  onClick={async () => {
                    await navigator.clipboard.writeText(url);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                >
                  {copied ? <Check /> : <Copy />} Copy
                </Button>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/card/${slug}/png?v=${version}`}
                alt="Report card preview"
                className="w-full rounded-md border bg-background"
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" asChild>
                  <a href={`/card/${slug}/png?download=1&v=${version}`} download={`pullscope-${slug}.png`}>
                    <Download /> Download PNG
                  </a>
                </Button>
                <Button asChild>
                  <a href={`/card/${slug}`} target="_blank" rel="noreferrer">
                    <ExternalLink /> Open public page
                  </a>
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
