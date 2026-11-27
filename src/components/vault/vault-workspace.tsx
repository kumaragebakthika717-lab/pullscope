"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCopy,
  Dumbbell,
  History,
  Loader2,
  MessageSquareText,
  RefreshCw,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CompleteDialog } from "@/components/vault/complete-dialog";
import { PlanEditor } from "@/components/vault/plan-editor";
import { SyncChatDialog } from "@/components/vault/sync-chat-dialog";
import {
  confirmWorkout,
  deleteDraft,
  generateWorkout,
  loadVaultDay,
  reopenWorkout,
  saveDraft,
} from "@/app/actions/vault";
import { prettyDate, planDigest, planToPayload, shortDate, todayLocal } from "@/lib/vault/format";
import { SLOT_LABELS } from "@/lib/vault/program";
import type { PlanPayload } from "@/lib/vault/schemas";
import type { ConcreteSlot, DaySlot, VaultDayPayload, VaultResult, WorkoutPlan } from "@/lib/vault/types";

type LoadError = Extract<VaultResult<unknown>, { ok: false }>;
type Busy = null | "generate" | "save" | "confirm" | "reopen" | "delete";

type GeneratorProps = {
  slot: DaySlot;
  onSlotChange: (slot: DaySlot) => void;
  notes: string;
  onNotesChange: (notes: string) => void;
  autoSlot: ConcreteSlot;
  aiConfigured: boolean;
  aiModel: string | null;
  busy: Busy;
  onSubmit: () => void;
  submitLabel: string;
  hint?: string;
};

function GeneratorFields({
  slot,
  onSlotChange,
  notes,
  onNotesChange,
  autoSlot,
  aiConfigured,
  aiModel,
  busy,
  onSubmit,
  submitLabel,
  hint,
}: GeneratorProps) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[220px_minmax(0,1fr)]">
        <div className="space-y-1.5">
          <Label>Session slot</Label>
          <Select value={slot} onValueChange={(value) => onSlotChange(value as DaySlot)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto — {SLOT_LABELS[autoSlot]}</SelectItem>
              {(Object.entries(SLOT_LABELS) as [ConcreteSlot, string][]).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Anything different today?</Label>
          <Textarea
            value={notes}
            rows={2}
            maxLength={600}
            placeholder="e.g. slept badly, only 30 minutes, shoulder feels fine"
            onChange={(e) => onNotesChange(e.target.value)}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={onSubmit} disabled={busy !== null} className="font-semibold">
          {busy === "generate" ? <Loader2 className="animate-spin" /> : <Wand2 />}
          {busy === "generate" ? "Generating…" : submitLabel}
        </Button>
        <span className="text-xs text-muted-foreground">
          {aiConfigured ? (
            <>
              <Sparkles className="mr-1 inline size-3 text-brand" />
              Live AI · {aiModel}
            </>
          ) : (
            "Program engine — set VAULT_AI_API_KEY to use live AI."
          )}
        </span>
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fall through to the legacy path for browsers that deny clipboard-write.
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  area.remove();
  return copied;
}

function stamp(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

const STATUS_VARIANT: Record<WorkoutPlan["status"], "default" | "secondary" | "outline" | "destructive"> = {
  draft: "secondary",
  confirmed: "default",
  completed: "outline",
  skipped: "destructive",
};

export function VaultWorkspace() {
  // Resolved on the client so "today" matches the athlete's clock, not the server's.
  const [date, setDate] = useState<string | null>(null);
  const [day, setDay] = useState<VaultDayPayload | null>(null);
  const [editor, setEditor] = useState<PlanPayload | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [slot, setSlot] = useState<DaySlot>("auto");
  const [genNotes, setGenNotes] = useState("");
  const [showGenerator, setShowGenerator] = useState(false);
  const [discardArmed, setDiscardArmed] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);

  const load = useCallback(
    async (silent = false) => {
      if (!date) return;
      if (!silent) setState("loading");
      const res = await loadVaultDay(date);
      if (res.ok) {
        setDay(res.data);
        if (!silent) setEditor(res.data.plan ? planToPayload(res.data.plan) : null);
        setLoadError(null);
        setState("ready");
      } else {
        setLoadError(res);
        setState("error");
      }
    },
    [date],
  );

  useEffect(() => {
    setDate(todayLocal());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function applyPlan(plan: WorkoutPlan) {
    setDay((current) => {
      if (!current) return current;
      const history = [plan, ...current.history.filter((h) => h.id !== plan.id)]
        .sort((a, b) => b.plan_date.localeCompare(a.plan_date))
        .slice(0, 12);
      return { ...current, plan, history };
    });
    setEditor(planToPayload(plan));
  }

  function cleanedEditor(): PlanPayload | null {
    if (!editor) return null;
    return {
      ...editor,
      title: editor.title.trim(),
      warnings: editor.warnings.map((w) => w.trim()).filter(Boolean),
      exercises: editor.exercises.map((e) => ({ ...e, name: e.name.trim() })),
    };
  }

  async function onGenerate() {
    if (!date) return;
    setBusy("generate");
    const res = await generateWorkout({ date, slot, notes: genNotes });
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error);
      if (res.code === "conflict") await load(true);
      return;
    }
    applyPlan(res.data);
    setShowGenerator(false);
    setGenNotes("");
    toast.success(
      res.data.source === "ai" ? "Plan generated — edit anything, then confirm." : "Program plan ready — edit anything, then confirm.",
    );
  }

  async function onSave() {
    if (!date) return;
    const plan = cleanedEditor();
    if (!plan) return;
    setBusy("save");
    const res = await saveDraft({ date, plan });
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    applyPlan(res.data);
    toast.success("Draft saved.");
  }

  async function onConfirm() {
    if (!date || !day?.plan) return;
    const plan = cleanedEditor();
    if (!plan) return;
    setBusy("confirm");
    const saved = await saveDraft({ date, plan });
    if (!saved.ok) {
      setBusy(null);
      toast.error(saved.error);
      return;
    }
    const res = await confirmWorkout(saved.data.id);
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    applyPlan(res.data);
    toast.success("Confirmed for today.");
  }

  async function onReopen() {
    if (!day?.plan) return;
    setBusy("reopen");
    const res = await reopenWorkout(day.plan.id);
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    applyPlan(res.data);
    toast.success("Reopened as a draft.");
  }

  async function onDiscard() {
    if (!day?.plan) return;
    setBusy("delete");
    const res = await deleteDraft(day.plan.id);
    setBusy(null);
    setDiscardArmed(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    const id = day.plan.id;
    setDay((current) =>
      current ? { ...current, plan: null, history: current.history.filter((h) => h.id !== id) } : current,
    );
    setEditor(null);
    toast.success("Draft discarded.");
  }

  async function onCopy() {
    if (!day?.plan) return;
    const copied = await copyText(planDigest(day.plan));
    if (copied) toast.success("Session copied — paste it into the vault chat.");
    else toast.error("Could not copy. Your browser blocked clipboard access.");
  }

  const plan = day?.plan ?? null;
  const activeDate = date ?? plan?.plan_date ?? "";
  const locked = plan ? plan.status !== "draft" : true;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Ultimate Strength Vault</p>
          <h1 className="font-display text-3xl font-bold uppercase tracking-wide">Today&apos;s session</h1>
          <p className="text-sm text-muted-foreground">
            {date ? prettyDate(date) : "Today"}
            {day ? ` · ${SLOT_LABELS[day.auto_slot]}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setSyncOpen(true)}>
            <MessageSquareText /> Sync chat
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Reload" onClick={() => load(true)}>
            <RefreshCw />
          </Button>
        </div>
      </header>

      {state === "loading" && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <div className="h-10 w-64 animate-pulse rounded-lg bg-muted" />
            <div className="h-96 animate-pulse rounded-xl bg-muted/60" />
          </div>
          <div className="space-y-4">
            <div className="h-36 animate-pulse rounded-xl bg-muted/60" />
            <div className="h-52 animate-pulse rounded-xl bg-muted/60" />
          </div>
        </div>
      )}

      {state === "error" && loadError && (
        <Card className="border-bad/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="size-4 text-bad" />
              {loadError.code === "setup" ? "One-time database setup needed" : "The Vault could not load"}
            </CardTitle>
            <CardDescription>{loadError.error}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loadError.code === "setup" ? (
              <>
                <p className="text-sm">
                  Open the Supabase SQL editor for this project, paste the contents of the migration file below, and run
                  it. It only adds three new tables with row-level security — nothing existing is touched.
                </p>
                <code className="block rounded-md bg-muted px-3 py-2 text-xs">{loadError.setupSql}</code>
                <p className="text-xs text-muted-foreground">
                  In the dashboard: Project → SQL Editor → New query → paste → Run. Then press Retry.
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Try again; if it keeps failing, check the Supabase project.</p>
            )}
            <Button variant="outline" size="sm" onClick={() => load()}>
              <RefreshCw /> Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {state === "ready" && day && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            {!plan && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 font-display text-lg uppercase tracking-wide">
                    <Dumbbell className="size-4" /> Plan today
                  </CardTitle>
                  <CardDescription>
                    No session saved for {prettyDate(activeDate)}. Generate one from the vault context, then edit and
                    confirm it.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <GeneratorFields
                    slot={slot}
                    onSlotChange={setSlot}
                    notes={genNotes}
                    onNotesChange={setGenNotes}
                    autoSlot={day.auto_slot}
                    aiConfigured={day.ai_configured}
                    aiModel={day.ai_model}
                    busy={busy}
                    onSubmit={onGenerate}
                    submitLabel="Generate today's workout"
                    hint="Generation reads the distilled chat context, your saved sessions and the deload calendar."
                  />
                </CardContent>
              </Card>
            )}

            {plan && editor && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={STATUS_VARIANT[plan.status]} className="capitalize">
                    {plan.status}
                  </Badge>
                  <Badge variant="outline">
                    {plan.source === "ai" ? "Live AI" : plan.source === "program" ? "Program engine" : "Manual"}
                  </Badge>
                  {plan.duration_min !== null && (
                    <span className="text-xs text-muted-foreground">~{plan.duration_min} min</span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {plan.status === "completed"
                      ? `Completed ${stamp(plan.completed_at)}`
                      : plan.status === "confirmed"
                        ? `Confirmed ${stamp(plan.confirmed_at)}`
                        : "Draft — not confirmed yet"}
                  </span>
                  <Button variant="ghost" size="sm" className="ml-auto" onClick={onCopy}>
                    <ClipboardCopy /> Copy update
                  </Button>
                </div>

                <PlanEditor payload={editor} onChange={setEditor} locked={locked} />

                <div className="flex flex-wrap items-center gap-2">
                  {plan.status === "draft" && (
                    <>
                      <Button variant="outline" onClick={onSave} disabled={busy !== null}>
                        {busy === "save" ? <Loader2 className="animate-spin" /> : <Save />}
                        Save draft
                      </Button>
                      <Button onClick={onConfirm} disabled={busy !== null} className="font-semibold">
                        {busy === "confirm" ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                        Confirm for {shortDate(activeDate)}
                      </Button>
                      {!discardArmed ? (
                        <Button variant="ghost" onClick={() => setDiscardArmed(true)} disabled={busy !== null}>
                          <Trash2 /> Discard
                        </Button>
                      ) : (
                        <span className="flex items-center gap-2 text-sm">
                          <span className="text-muted-foreground">Discard this draft?</span>
                          <Button variant="destructive" size="sm" onClick={onDiscard} disabled={busy !== null}>
                            Yes, discard
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setDiscardArmed(false)}>
                            Keep
                          </Button>
                        </span>
                      )}
                    </>
                  )}

                  {(plan.status === "confirmed" || plan.status === "completed") && (
                    <>
                      <Button variant="outline" onClick={onReopen} disabled={busy !== null}>
                        {busy === "reopen" ? <Loader2 className="animate-spin" /> : <RotateCcw />}
                        Reopen
                      </Button>
                      {plan.status === "confirmed" && (
                        <Button onClick={() => setCompleteOpen(true)} className="font-semibold">
                          <CheckCircle2 /> Complete session
                        </Button>
                      )}
                    </>
                  )}

                  {plan.status === "draft" && (
                    <Button variant="ghost" onClick={() => setShowGenerator((value) => !value)} disabled={busy !== null}>
                      <Wand2 /> Regenerate
                    </Button>
                  )}
                </div>

                {plan.session_notes && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Session notes</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">{plan.session_notes}</CardContent>
                  </Card>
                )}

                {showGenerator && plan.status === "draft" && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Regenerate this day</CardTitle>
                      <CardDescription>
                        This replaces the current draft. Nothing is confirmed until you press Confirm.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <GeneratorFields
                        slot={slot}
                        onSlotChange={setSlot}
                        notes={genNotes}
                        onNotesChange={setGenNotes}
                        autoSlot={day.auto_slot}
                        aiConfigured={day.ai_configured}
                        aiModel={day.ai_model}
                        busy={busy}
                        onSubmit={onGenerate}
                        submitLabel="Replace with a new plan"
                        hint="Use the slot override when training has drifted from the weekday template."
                      />
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </div>

          <aside className="space-y-4">
            <Card size="sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <MessageSquareText className="size-4" /> Chat source
                </CardTitle>
                <CardDescription>{day.context.source.chat}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-xs text-muted-foreground">
                <p>Chat exported {stamp(day.transcript_exported_at)}</p>
                <p>
                  {day.transcript_chars.toLocaleString()} chars kept for generation · context updated{" "}
                  {stamp(day.context_updated_at)}
                </p>
                <Button variant="outline" size="sm" className="w-full" onClick={() => setSyncOpen(true)}>
                  <RefreshCw /> Import a fresh export
                </Button>
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Sparkles className="size-4" /> Next prescribed
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                {Object.values(day.context.next_sessions).map((session) => (
                  <div key={session.label} className="space-y-0.5 border-b border-border/50 pb-1.5 last:border-0 last:pb-0">
                    <p className="font-medium text-foreground">{session.label}</p>
                    <p className="text-muted-foreground">
                      {session.sets}×{session.reps} @ {session.mass_kg} kg · RPE {session.rpe}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle className="text-sm">Goals</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-xs">
                {day.context.goals.slice(0, 4).map((goal) => (
                  <p key={goal.lift} className="flex justify-between gap-3">
                    <span className="text-muted-foreground">{goal.lift}</span>
                    <span className="shrink-0 font-medium text-foreground">
                      {goal.target_kg} kg <span className="font-normal text-muted-foreground">by {goal.by}</span>
                    </span>
                  </p>
                ))}
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle className="text-sm">Tested</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-xs">
                {day.context.latest_tests.slice(0, 5).map((test) => (
                  <p key={test.lift} className="flex justify-between gap-3">
                    <span className="text-muted-foreground">{test.lift}</span>
                    <span className="shrink-0 font-medium text-foreground">
                      {test.kg} kg <span className="font-normal text-muted-foreground">· {shortDate(test.date)}</span>
                    </span>
                  </p>
                ))}
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <AlertTriangle className="size-4" /> Working around
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {day.context.limitations.slice(0, 5).map((limitation) => (
                    <li key={limitation} className="flex gap-1.5">
                      <span className="text-brand">•</span>
                      {limitation}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <History className="size-4" /> Saved sessions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                {day.history.filter((h) => h.plan_date !== activeDate).length === 0 ? (
                  <p className="text-muted-foreground">
                    {plan?.status === "completed"
                      ? "Today's session is saved. Past days appear here."
                      : "Nothing saved yet. Completed sessions appear here."}
                  </p>
                ) : (
                  day.history
                    .filter((h) => h.plan_date !== activeDate)
                    .slice(0, 7)
                    .map((entry) => (
                      <div key={entry.id} className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">{entry.title}</p>
                          <p className="text-muted-foreground">
                            {shortDate(entry.plan_date)} · {entry.source}
                          </p>
                        </div>
                        <Badge variant={STATUS_VARIANT[entry.status]} className="capitalize">
                          {entry.status}
                        </Badge>
                      </div>
                    ))
                )}
              </CardContent>
            </Card>
          </aside>
        </div>
      )}

      {day?.plan && (
        <CompleteDialog
          plan={day.plan}
          open={completeOpen}
          onOpenChange={setCompleteOpen}
          onCompleted={(updated) => {
            applyPlan(updated);
            void load(true); // context (counters, next loads) changed on the server
          }}
        />
      )}
      <SyncChatDialog
        open={syncOpen}
        onOpenChange={setSyncOpen}
        exportedAt={day?.transcript_exported_at ?? null}
        onImported={() => load(true)}
      />
    </div>
  );
}