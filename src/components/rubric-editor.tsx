"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Check, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addAttribute, deleteAttribute, reorderAttribute, updateAttribute } from "@/app/actions/rubric";
import type { RubricAttribute } from "@/lib/types";

export function RubricEditor({ initial }: { initial: RubricAttribute[] }) {
  const [items, setItems] = useState(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", description: "" });
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: string }>, rollback?: RubricAttribute[]) {
    setBusy(key);
    const res = await fn();
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error ?? "Something went wrong");
      if (rollback) setItems(rollback);
      return false;
    }
    return true;
  }

  function move(index: number, dir: "up" | "down") {
    const j = dir === "up" ? index - 1 : index + 1;
    if (j < 0 || j >= items.length) return;
    const prev = items;
    const next = [...items];
    [next[index], next[j]] = [next[j], next[index]];
    setItems(next);
    run(`move-${items[index].id}`, () => reorderAttribute(items[index].id, dir), prev);
  }

  async function save(id: string) {
    const prev = items;
    setItems(items.map((a) => (a.id === id ? { ...a, name: draft.name.trim(), description: draft.description.trim() || null } : a)));
    setEditing(null);
    await run(`edit-${id}`, () => updateAttribute(id, draft), prev);
  }

  async function remove(a: RubricAttribute) {
    if (!confirm(`Remove "${a.name}" from your rubric? Past annotations are kept but hidden from report cards.`)) return;
    const prev = items;
    setItems(items.filter((x) => x.id !== a.id));
    await run(`del-${a.id}`, () => deleteAttribute(a.id), prev);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setBusy("add");
    const res = await addAttribute({ name: newName, description: newDesc });
    setBusy(null);
    if (!res.ok) return toast.error(res.error);
    setItems([...items, res.data]);
    setNewName("");
    setNewDesc("");
  }

  return (
    <div className="space-y-4">
      <ol className="divide-y rounded-xl border bg-card">
        {items.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">No attributes. Add one below.</li>}
        {items.map((a, i) => (
          <li key={a.id} className="flex items-center gap-3 px-4 py-3">
            <span className="w-6 text-right font-mono text-xs text-muted-foreground">{i + 1}</span>
            {editing === a.id ? (
              <form
                className="flex flex-1 flex-col gap-2 sm:flex-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  save(a.id);
                }}
                onKeyDown={(e) => e.key === "Escape" && setEditing(null)}
              >
                <Input autoFocus value={draft.name} maxLength={80} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="sm:w-56" />
                <Input value={draft.description} maxLength={300} placeholder="Description" onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
                <div className="flex gap-1">
                  <Button type="submit" size="icon" aria-label="Save" disabled={!draft.name.trim()}>
                    <Check />
                  </Button>
                  <Button type="button" size="icon" variant="ghost" aria-label="Cancel" onClick={() => setEditing(null)}>
                    <X />
                  </Button>
                </div>
              </form>
            ) : (
              <>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{a.name}</p>
                  {a.description && <p className="truncate text-sm text-muted-foreground">{a.description}</p>}
                </div>
                {busy?.endsWith(a.id) && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
                <div className="flex gap-1">
                  <Button size="icon-sm" variant="ghost" aria-label="Move up" disabled={i === 0 || !!busy} onClick={() => move(i, "up")}>
                    <ArrowUp />
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label="Move down" disabled={i === items.length - 1 || !!busy} onClick={() => move(i, "down")}>
                    <ArrowDown />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Rename"
                    onClick={() => {
                      setEditing(a.id);
                      setDraft({ name: a.name, description: a.description ?? "" });
                    }}
                  >
                    <Pencil />
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label="Delete" className="hover:text-bad" onClick={() => remove(a)}>
                    <Trash2 />
                  </Button>
                </div>
              </>
            )}
          </li>
        ))}
      </ol>

      <form onSubmit={add} className="flex flex-col gap-2 rounded-xl border border-dashed p-4 sm:flex-row">
        <Input placeholder="New attribute name" maxLength={80} value={newName} onChange={(e) => setNewName(e.target.value)} className="sm:w-56" />
        <Input placeholder="Description (optional)" maxLength={300} value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
        <Button type="submit" disabled={!newName.trim() || busy === "add"}>
          {busy === "add" ? <Loader2 className="animate-spin" /> : <Plus />} Add
        </Button>
      </form>
    </div>
  );
}
