"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Info, ListOrdered, Trash2, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  ATTRIBUTES,
  CRAFT_SIZE,
  INTERPRETATIONS,
  MECHANICS_SIZE,
  MODEL_VERSION,
  TIER_BANDS,
  scoreTechnicality,
  normalizeName,
  type AttributeId,
  type AttributeScore,
  type FamilyScore,
  type InputRow,
  type PullerScore,
  type TierDef,
} from "@/lib/analysis/technicality";
import { parseTechnicalityInput } from "@/lib/analysis/technicality-input";
import { EXAMPLE_TECHNICALITY_INPUT } from "@/lib/analysis/technicality-example";
import { cn } from "@/lib/utils";

const PLACEHOLDER = `Paste a JSON array, or tab/comma-separated rows.

[
  { "puller": "Oleg", "match": "EVW26 vs Arthur",
    "ratings": { "Fingers": "G", "Palm": "B", "Wrist": "G" } }
]`;

const STORAGE_KEY = "pullscope:technicality-input:v1";
const LABEL_BY_ID = new Map(ATTRIBUTES.map((attribute) => [attribute.id, attribute.label]));

type StoredDraft = { input: string; fileName: string | null };

function readStoredDraft(): StoredDraft | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<StoredDraft>;
    return typeof value.input === "string" ? { input: value.input, fileName: value.fileName ?? null } : null;
  } catch {
    return null;
  }
}

function writeStoredDraft(input: string, fileName: string | null) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ input, fileName }));
  } catch {
    // Storage can be unavailable (private mode, quota); the editor still works in-memory.
  }
}

function rowKey(row: InputRow): string {
  return `${normalizeName(row.puller)}||${normalizeName(row.match)}`;
}

function mergeRows(base: InputRow[], incoming: InputRow[]): InputRow[] {
  const merged = base.map((row) => ({ ...row, ratings: { ...row.ratings } }));
  const indexByKey = new Map(merged.map((row, index) => [rowKey(row), index]));
  for (const row of incoming) {
    const key = rowKey(row);
    const existing = indexByKey.get(key);
    if (existing === undefined) {
      indexByKey.set(key, merged.length);
      merged.push({ ...row, ratings: { ...row.ratings } });
      continue;
    }
    merged[existing] = { ...merged[existing], ratings: { ...merged[existing].ratings, ...row.ratings } };
  }
  return merged;
}

function serializeRows(rows: InputRow[]): string {
  return JSON.stringify(
    rows.map((row) => ({
      puller: row.puller,
      match: row.match,
      ratings: Object.fromEntries(
        Object.entries(row.ratings).map(([id, value]) => [
          LABEL_BY_ID.get(id as AttributeId) ?? id,
          value === 1 ? "G" : value === -1 ? "R" : "B",
        ]),
      ),
    })),
    null,
    2,
  );
}

function downloadSnapshot(content: string, extension: "json" | "txt") {
  const blob = new Blob([content], { type: extension === "json" ? "application/json" : "text/plain" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `technicality-${new Date().toISOString().slice(0, 10)}.${extension}`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatSigned(value: number, digits = 2): string {
  if (Math.abs(value) < 0.0005) return (0).toFixed(digits);
  return `${value > 0 ? "+" : "-"}${Math.abs(value).toFixed(digits)}`;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatValue(value: number | null, digits = 1): string {
  return value === null ? "—" : value.toFixed(digits);
}

function tierClass(tier: TierDef | null): string {
  if (!tier) return "border-border text-muted-foreground";
  if (tier.letter === "S") return "border-brand/50 bg-brand/15 text-brand";
  if (tier.letter === "A") return "border-good/50 bg-good/15 text-good";
  if (tier.letter === "B") return "border-border bg-muted text-foreground";
  if (tier.letter === "C") return "border-amber-600/40 bg-amber-600/10 text-amber-400";
  return "border-bad/50 bg-bad/15 text-bad";
}

function flagClass(flag: string): string {
  if (flag === "Ranked gate cleared") return "border-good/40 text-good";
  if (flag === "No rated attributes" || flag.startsWith("No ")) return "border-bad/40 text-bad";
  if (flag === "Below formal provisional gate" || flag === "Black rate above 40%") {
    return "border-brand/40 text-brand";
  }
  return "border-border text-muted-foreground";
}

function TierBadge({ tier }: { tier: TierDef | null }) {
  if (!tier) return <Badge variant="outline">No TI</Badge>;
  return (
    <Badge variant="outline" className={cn("gap-1", tierClass(tier))}>
      <span className="font-mono font-semibold">{tier.letter}</span>
      <span className="font-normal">{tier.name}</span>
    </Badge>
  );
}

function StatusBadge({ score }: { score: PullerScore }) {
  if (score.status === "unrated") return <Badge variant="destructive">Unrated</Badge>;
  if (score.status === "ranked") {
    return (
      <Badge variant="outline" className="border-good/40 text-good">
        Ranked
      </Badge>
    );
  }
  return <Badge variant="outline">{score.thin ? "Provisional · thin" : "Provisional"}</Badge>;
}

function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-md border border-border/70 bg-muted/30 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("font-mono text-lg leading-tight tabular-nums", accent && "text-brand")}>{value}</div>
    </div>
  );
}

function FamilyLine({ family }: { family: FamilyScore }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-[11px]">
      <span className="text-muted-foreground">
        {family.family} · {family.label}
      </span>
      <span className="shrink-0 font-mono tabular-nums">
        {formatSigned(family.sum, 1)}/{family.size} = {formatSigned(family.mean)}
        <span className="ml-1 text-muted-foreground/70">({family.rated})</span>
      </span>
    </div>
  );
}

function PullerCard({ score }: { score: PullerScore }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle>{score.puller}</CardTitle>
            <CardDescription>
              {score.matches} match{score.matches === 1 ? "" : "es"} · {score.n} verdict
              {score.n === 1 ? "" : "s"} · {formatPercent(score.coverage)} coverage
            </CardDescription>
          </div>
          <div className="flex flex-col items-end gap-1">
            <TierBadge tier={score.tier} />
            <StatusBadge score={score} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-4 gap-2">
          <Metric label="TI" value={formatValue(score.TI)} accent />
          <Metric label="Raw" value={formatValue(score.raw)} />
          <Metric label="Mech" value={formatValue(score.mechDisplay)} />
          <Metric label="Craft" value={formatValue(score.craftDisplay)} />
        </div>

        <div className="rounded-md border border-border/60 px-2.5 py-2">
          <FamilyLine family={score.families.A} />
          <FamilyLine family={score.families.B} />
          <FamilyLine family={score.families.C} />
          <FamilyLine family={score.families.D} />
        </div>

        {score.n > 0 && (
          <div className="rounded-md bg-muted/40 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
            <div>
              M = (A+B)/{MECHANICS_SIZE} = ({formatSigned(score.families.A.sum, 2)} +{" "}
              {formatSigned(score.families.B.sum, 2)}) / {MECHANICS_SIZE} = {score.M.toFixed(3)}
            </div>
            <div>
              K = (C+D)/{CRAFT_SIZE} = ({formatSigned(score.families.C.sum, 2)} +{" "}
              {formatSigned(score.families.D.sum, 2)}) / {CRAFT_SIZE} = {score.K.toFixed(3)}
            </div>
            <div>T = 0.7M + 0.3K = {score.T === null ? "— (both blocks required)" : score.T.toFixed(3)}</div>
            <div>
              r = n/(n+10) = {score.n}/{score.n + 10} = {score.r.toFixed(3)}
            </div>
            <div>TI = 50 + 50·r·T = {formatValue(score.TI)}</div>
          </div>
        )}

        <p className="text-xs leading-relaxed text-muted-foreground">{score.justification}</p>

        {score.flags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {score.flags.map((flag) => (
              <Badge key={flag} variant="outline" className={cn("text-[10px]", flagClass(flag))}>
                {flag}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function cellLabel(attribute: AttributeScore): string {
  if (attribute.rated === 0) return "–";
  const distinct = new Set(attribute.values);
  if (distinct.size === 1) {
    const value = attribute.values[0];
    const letter = value === 1 ? "G" : value === -1 ? "R" : "B";
    return attribute.rated > 1 ? `${letter}·${attribute.rated}` : letter;
  }
  return `${formatSigned(attribute.score)}·${attribute.rated}`;
}

function cellTitle(attribute: AttributeScore): string {
  if (attribute.rated === 0) return "Blank / not rated";
  return attribute.perMatch
    .map((entry) => `${entry.match}: ${entry.value === 1 ? "green (+1)" : entry.value === -1 ? "red (-1)" : "black (0)"}`)
    .join("\n");
}

function cellClass(attribute: AttributeScore): string {
  if (attribute.rated === 0) return "text-muted-foreground/40";
  const distinct = new Set(attribute.values);
  if (distinct.size === 1) {
    if (attribute.values[0] === 1) return "bg-good/10 text-good";
    if (attribute.values[0] === -1) return "bg-bad/10 text-bad";
    return "bg-muted/60 text-muted-foreground";
  }
  return "text-foreground";
}

function AttributeMatrix({ scores }: { scores: PullerScore[] }) {
  if (scores.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Per-attribute verdicts</CardTitle>
        <CardDescription>
          One row per criterion. Letters are verdicts; a dot and a count mark multiple match verdicts. Hover a cell for the
          match-by-match evidence.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-xs">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="sticky left-0 bg-card py-1 pr-2 font-medium">#</th>
                <th className="py-1 pr-3 font-medium">Attribute</th>
                <th className="py-1 pr-3 font-medium">Fam</th>
                {scores.map((score) => (
                  <th key={score.puller} className="whitespace-nowrap px-2 py-1 text-center font-medium">
                    {score.puller}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ATTRIBUTES.map((attribute, index) => (
                <tr key={attribute.id} className="border-t border-border/60">
                  <td className="sticky left-0 bg-card py-1 pr-2 font-mono text-muted-foreground">{index + 1}</td>
                  <td className="whitespace-nowrap py-1 pr-3">{attribute.label}</td>
                  <td className="py-1 pr-3">
                    <Badge variant="outline" className="px-1.5 font-mono">
                      {attribute.family}
                    </Badge>
                  </td>
                  {scores.map((score) => {
                    const cell = score.attributes[index];
                    return (
                      <td
                        key={score.puller}
                        title={cellTitle(cell)}
                        className={cn("px-2 py-1 text-center font-mono tabular-nums", cellClass(cell))}
                      >
                        {cellLabel(cell)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <span>
            <span className="font-mono text-good">G</span> +1 green
          </span>
          <span>
            <span className="font-mono">B</span> 0 black / neutral, observed
          </span>
          <span>
            <span className="font-mono text-bad">R</span> −1 red
          </span>
          <span>
            <span className="font-mono">–</span> blank / not rated
          </span>
          <span>
            <span className="font-mono">·2</span> two match verdicts
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export function TechnicalityWorkspace() {
  const [input, setInput] = useState(EXAMPLE_TECHNICALITY_INPUT);
  const [fileName, setFileName] = useState<string | null>("Current rankings — 5 cards");
  const [fileError, setFileError] = useState<string | null>(null);
  const [mergeImport, setMergeImport] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => parseTechnicalityInput(input), [input]);
  const result = useMemo(
    () => (parsed.rows.length > 0 ? scoreTechnicality(parsed.rows, parsed.warnings, parsed.errors) : null),
    [parsed],
  );

  useEffect(() => {
    const saved = readStoredDraft();
    if (!saved) return;
    setInput(saved.input);
    setFileName(saved.fileName);
  }, []);

  const scored = result?.scored ?? [];
  const noIndex = result?.noIndex ?? [];
  const unrated = result?.unrated ?? [];
  const allScores = result?.scores ?? [];

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileError(null);
    if (file.size > 2_000_000) {
      setFileError("File is larger than 2 MB; paste the rows instead.");
      event.target.value = "";
      return;
    }
    try {
      const text = await file.text();
      if (mergeImport) {
        const incoming = parseTechnicalityInput(text);
        if (incoming.errors.length > 0 && incoming.rows.length === 0) {
          setFileError(incoming.errors[0]);
        } else {
          const next = parsed.rows.length > 0 ? serializeRows(mergeRows(parsed.rows, incoming.rows)) : text;
          setInput(next);
          setFileName(`${file.name} merged`);
          writeStoredDraft(next, `${file.name} merged`);
        }
      } else {
        setInput(text);
        setFileName(file.name);
        writeStoredDraft(text, file.name);
      }
    } catch (error) {
      setFileError((error as Error).message);
    }
    event.target.value = "";
  }

  function loadCurrentRankings() {
    setInput(EXAMPLE_TECHNICALITY_INPUT);
    setFileName("Current rankings — 5 cards");
    setFileError(null);
    writeStoredDraft(EXAMPLE_TECHNICALITY_INPUT, "Current rankings — 5 cards");
  }

  function clearInput() {
    setInput("");
    setFileName(null);
    setFileError(null);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing to clean up if storage is unavailable.
    }
  }

  function saveSnapshot() {
    if (parsed.rows.length > 0 && parsed.errors.length === 0) {
      downloadSnapshot(serializeRows(parsed.rows), "json");
    } else {
      downloadSnapshot(input, "txt");
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-6">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Technicality engine</h1>
          <Badge variant="outline" className="font-mono">
            {MODEL_VERSION}
          </Badge>
          <Badge variant="outline">Live calculation</Badge>
        </div>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Paste or upload card verdicts. The engine applies every attribute in the blueprint, computes the Technicality Index,
          assigns a tier, and explains the placement. Deterministic — no model inference, no network calls.
        </p>
        <p className="mt-2 max-w-3xl text-xs text-muted-foreground">
          Preloaded with the <span className="text-foreground">current rankings</span>: 9 pullers from 5 cards (EVW26, EVW24,
          KOTT9, EVW23, EVW7). Clear the box to run your own data.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Raw data</CardTitle>
          <CardDescription>
            Autosaved in this browser. One row per puller per match; the same puller name aggregates across matches.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={input}
            onChange={(event) => {
              const value = event.target.value;
              setInput(value);
              setFileName(null);
              setFileError(null);
              writeStoredDraft(value, null);
            }}
            placeholder={PLACEHOLDER}
            spellCheck={false}
            className="min-h-[220px] font-mono text-xs"
            aria-label="Raw technique data"
          />

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".json,.csv,.tsv,.txt"
              className="hidden"
              onChange={(event) => void onFile(event)}
            />
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload />
              Import file
            </Button>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="size-3.5 accent-brand"
                checked={mergeImport}
                onChange={(event) => setMergeImport(event.target.checked)}
              />
              Merge into current
            </label>
            <Button size="sm" variant="outline" onClick={saveSnapshot} disabled={!input}>
              <Download />
              Save snapshot
            </Button>
            <Button size="sm" variant="secondary" onClick={loadCurrentRankings}>
              <ListOrdered />
              Load current rankings
            </Button>
            <Button size="sm" variant="ghost" onClick={clearInput} disabled={!input}>
              <Trash2 />
              Clear
            </Button>
            <span className="ml-auto text-xs text-muted-foreground">
              {fileName ?? `${input.length.toLocaleString()} characters`}
            </span>
          </div>

          {fileError && <p className="text-xs text-bad">{fileError}</p>}

          <details className="rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            <summary className="cursor-pointer font-medium text-foreground">Accepted formats</summary>
            <div className="mt-2 grid gap-3 md:grid-cols-2">
              <div>
                <p className="font-medium text-foreground">JSON array</p>
                <pre className="mt-1 overflow-x-auto rounded bg-background/70 p-2 font-mono text-[11px]">
                  {`[{ "puller": "Oleg", "match": "EVW26",
    "ratings": { "Fingers": "G", "Palm": "B" } }]`}
                </pre>
              </div>
              <div>
                <p className="font-medium text-foreground">Table</p>
                <pre className="mt-1 overflow-x-auto rounded bg-background/70 p-2 font-mono text-[11px]">
                  {`puller,match,Fingers,Depth (pronator)
Oleg,EVW26,G,R`}
                </pre>
              </div>
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              <li>Ratings: G / good / +1, B / black / neutral / 0, R / bad / −1. Blank or “-” is unrated.</li>
              <li>Duplicate puller+match rows merge; the later value wins and a warning is shown.</li>
              <li>Unknown columns are ignored with a warning. `strap` is flagged as the blueprint’s unresolved 20th attribute.</li>
            </ul>
          </details>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="size-4" />
            Interpretation applied before calculation
          </CardTitle>
          <CardDescription>The source’s rules, not tunable settings.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1.5 text-xs leading-relaxed text-muted-foreground">
            {INTERPRETATIONS.map((line) => (
              <li key={line} className="flex gap-2">
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-brand" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {parsed.errors.length > 0 && (
        <Card className="border-bad/40">
          <CardHeader>
            <CardTitle className="text-bad">Input errors</CardTitle>
            <CardDescription>Fix these before the results can be trusted.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-xs text-bad">
              {parsed.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {!result && parsed.errors.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Paste data, load the current rankings, or upload a file to calculate the tier list.
          </CardContent>
        </Card>
      )}

      {result && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="Pullers" value={String(result.stats.pullers)} />
            <Metric label="With TI" value={String(result.stats.scored)} />
            <Metric label="Ranked gate" value={String(result.stats.ranked)} />
            <Metric label="Unrated" value={String(result.stats.unrated)} />
          </div>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <ListOrdered className="size-4" />
                    Tier list
                  </CardTitle>
                  <CardDescription>
                    Highest TI first. Tier letters label the blueprint’s presentation bands; status is the separate evidence gate.
                  </CardDescription>
                </div>
                <Badge variant="outline">{scored.length} with TI</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                {TIER_BANDS.map((tier) => {
                  const members = scored.filter((score) => score.tier?.letter === tier.letter);
                  return (
                    <div key={tier.letter} className="flex flex-wrap items-baseline gap-2 text-xs">
                      <Badge variant="outline" className={cn("w-5 justify-center px-1 font-mono", tierClass(tier))}>
                        {tier.letter}
                      </Badge>
                      <span className="w-40 text-muted-foreground">
                        {tier.name} <span className="font-mono text-[10px]">{tier.range}</span>
                      </span>
                      <span className="flex flex-wrap gap-x-3 gap-y-1">
                        {members.length === 0 ? (
                          <span className="text-muted-foreground/60">—</span>
                        ) : (
                          members.map((member) => (
                            <span key={member.puller}>
                              <span className="font-mono text-muted-foreground">#{scored.indexOf(member) + 1}</span>{" "}
                              {member.puller}
                            </span>
                          ))
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] text-xs">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="py-1 pr-2 font-medium">#</th>
                      <th className="py-1 pr-3 font-medium">Puller</th>
                      <th className="py-1 pr-3 font-medium">Tier</th>
                      <th className="py-1 pr-3 text-right font-medium">TI</th>
                      <th className="py-1 pr-3 text-right font-medium">Raw</th>
                      <th className="py-1 pr-3 text-right font-medium">Mech</th>
                      <th className="py-1 pr-3 text-right font-medium">Craft</th>
                      <th className="py-1 pr-3 text-right font-medium">Mtchs</th>
                      <th className="py-1 pr-3 text-right font-medium">Verdicts</th>
                      <th className="py-1 pr-3 text-right font-medium">Coverage</th>
                      <th className="py-1 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scored.map((score, index) => (
                      <tr key={score.puller} className="border-t border-border">
                        <td className="py-1.5 pr-2 font-mono text-muted-foreground">{index + 1}</td>
                        <td className="py-1.5 pr-3 font-medium">{score.puller}</td>
                        <td className="py-1.5 pr-3">
                          <TierBadge tier={score.tier} />
                        </td>
                        <td className="py-1.5 pr-3 text-right font-mono tabular-nums text-brand">
                          {formatValue(score.TI)}
                        </td>
                        <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{formatValue(score.raw)}</td>
                        <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{formatValue(score.mechDisplay)}</td>
                        <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{formatValue(score.craftDisplay)}</td>
                        <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{score.matches}</td>
                        <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{score.n}</td>
                        <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{formatPercent(score.coverage)}</td>
                        <td className="py-1.5">
                          <StatusBadge score={score} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {unrated.length > 0 && (
                <div className="rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Unrated (no evidence):</span>{" "}
                  {unrated.map((score) => score.puller).join(", ")}. A blank card is not scored as a neutral 50.
                </div>
              )}
              {noIndex.length > 0 && (
                <div className="rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">No TI (missing block):</span>{" "}
                  {noIndex.map((score) => score.puller).join(", ")}. The composite requires both mechanics and craft evidence.
                </div>
              )}
            </CardContent>
          </Card>

          <div>
            <h2 className="mb-3 font-heading text-lg font-medium">Score detail and justification</h2>
            <div className="grid gap-4 lg:grid-cols-2">
              {allScores.map((score) => (
                <PullerCard key={score.puller} score={score} />
              ))}
            </div>
          </div>

          <AttributeMatrix scores={allScores} />

          {result.warnings.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Parser warnings ({result.warnings.length})</CardTitle>
                <CardDescription>What was ignored or normalized on the way in.</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="max-h-56 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                  {result.warnings.map((warning, index) => (
                    <li key={`${warning}-${index}`} className="flex gap-2">
                      <span className="mt-1.5 size-1 shrink-0 rounded-full bg-brand" />
                      <span>{warning}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Model notes</CardTitle>
          <CardDescription>Scope limits carried over from the source.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1.5 text-xs leading-relaxed text-muted-foreground">
            <li>No criterion is invented here. The engine uses only the 19 attributes and the ti_v1.1-19 formulas in the blueprint.</li>
            <li>`strap`, the EVW7 card’s 20th row, is not in the 19-attribute model. It overlaps “Out of strap” and is excluded with a warning.</li>
            <li>Opponent-strength adjustment, recency weighting and multi-analyst agreement are v2 items in the source and are not applied.</li>
            <li>The preloaded current rankings are the five-card dataset (EVW26, EVW24, KOTT9, EVW23, EVW7) transcribed 2026-11-18. They behave exactly like pasted data and are not live results.</li>
            <li>Drafts are autosaved to this browser only (localStorage) and never leave the device. Clear removes the saved draft; use Save snapshot for a file you can keep or move to another device.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}