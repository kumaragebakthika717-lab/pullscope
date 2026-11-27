"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { importTranscript } from "@/app/actions/vault";
import type { TranscriptSummary } from "@/lib/vault/types";

const MAX_CHARS = 5_500_000;

export function SyncChatDialog({
  open,
  onOpenChange,
  exportedAt,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exportedAt: string | null;
  onImported: () => Promise<void> | void;
}) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TranscriptSummary | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setText("");
      setFileName(null);
      setError(null);
      setResult(null);
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [open]);

  async function onFile(file: File | null) {
    setError(null);
    setResult(null);
    if (!file) return;
    if (file.size > MAX_CHARS) {
      setError("That file is larger than 5.5 MB. Export a shorter range of the chat.");
      return;
    }
    const content = await file.text();
    if (content.length < 100) {
      setError("That file looks empty.");
      return;
    }
    setText(content);
    setFileName(file.name);
  }

  async function submit() {
    setError(null);
    setBusy(true);
    const res = await importTranscript({ text });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setResult(res.data);
    toast.success(`Imported ${res.data.messages} messages from the vault chat.`);
    await onImported();
  }

  const charCount = text.length.toLocaleString();

  return (
    <Dialog open={open} onOpenChange={(next) => (!busy ? onOpenChange(next) : undefined)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-xl uppercase tracking-wide">Sync the vault chat</DialogTitle>
          <DialogDescription>
            Import the Markdown export of <span className="text-foreground">Ultimate Strength Vault</span>. The newest part of
            the thread is stored for generation, and stated maxes, session counts and limitations update the context.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-lg border border-good/40 bg-good/10 p-3 text-sm">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-good" />
              <div>
                <p className="font-medium">
                  Imported {result.messages} messages · {result.chars.toLocaleString()} characters
                </p>
                <p className="text-xs text-muted-foreground">
                  Export timestamp: {result.exported_at ? new Date(result.exported_at).toLocaleString() : "not found"}
                </p>
              </div>
            </div>
            {result.extracted.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Found in the chat</p>
                <ul className="space-y-1 text-sm">
                  {result.extracted.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="text-brand">•</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">What changed</p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {result.notes.map((note) => (
                  <li key={note}>• {note}</li>
                ))}
              </ul>
            </div>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="vault-export">Export file</Label>
                <Input
                  id="vault-export"
                  ref={fileRef}
                  type="file"
                  accept=".md,.markdown,.txt,text/markdown,text/plain"
                  onChange={(e) => onFile(e.target.files?.[0] ?? null)}
                />
                {exportedAt && (
                  <p className="text-xs text-muted-foreground">
                    Last import: {new Date(exportedAt).toLocaleString()}
                  </p>
                )}
              </div>

              {fileName ? (
                <div className="flex items-center justify-between gap-3 rounded-lg border bg-background p-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{fileName}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{charCount} chars</span>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="vault-paste">…or paste the export</Label>
                  <Textarea
                    id="vault-paste"
                    value={text}
                    rows={6}
                    placeholder="Paste the whole Markdown transcript here."
                    onChange={(e) => setText(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">{charCount} characters</p>
                </div>
              )}
            </div>

            {error && (
              <p className="text-sm text-bad" role="alert">
                {error}
              </p>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={busy || text.length < 100} className="font-semibold">
                {busy && <Loader2 className="animate-spin" />}
                {busy ? "Reading chat…" : "Import transcript"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}