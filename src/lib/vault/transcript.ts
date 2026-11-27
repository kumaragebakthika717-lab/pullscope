export type ParsedMessage = { role: "user" | "assistant"; text: string };

export type ExtractedFacts = {
  tests: { lift: string; kg: number }[];
  pressSessionsDone: number | null;
  legSessionsDone: number | null;
  limitations: string[];
};

export type ParsedTranscript = {
  exportedAt: string | null;
  messages: ParsedMessage[];
  cleanText: string;
  tail: string;
  facts: ExtractedFacts;
  highlights: string[];
};

const TAIL_CHARS = 14_000;
const KEEP_CHARS = 200_000;

const LIFT_NAMES: Record<string, string> = {
  ZERCHER: "Zercher squat",
  RDL: "RDL",
  PRESS: "Seated press",
  LUNGE: "Reverse lunge",
  SQUAT: "Back squat",
};

function liftName(raw: string): string {
  const key = raw.trim().toUpperCase();
  const known = LIFT_NAMES[key];
  if (known) return known;
  return key
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function cleanBody(body: string): string {
  return body
    .replace(/\r/g, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^#### .*$/gm, "")
    .replace(/^\*\*(Input|Response):\*\*\s*$/gm, "")
    .replace(/^\[hook:.*$/gm, "")
    .replace(/^\s*(?:total \d+|drwxr-|[A-Za-z]:[\\/]).*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseVaultTranscript(raw: string): ParsedTranscript {
  const text = raw.replace(/\r\n/g, "\n");
  const exportedAt = text.match(/\*\*Exported:\*\*\s*([^\s]+)/)?.[1] ?? null;

  const header = /^### \*\*(You|Assistant)\*\*\s*$/gm;
  const marks: { role: "user" | "assistant"; index: number; end: number }[] = [];
  for (const m of text.matchAll(header)) {
    marks.push({ role: m[1] === "You" ? "user" : "assistant", index: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
  }

  const messages: ParsedMessage[] = [];
  for (let i = 0; i < marks.length; i++) {
    const body = text.slice(marks[i].end, marks[i + 1]?.index ?? text.length);
    const cleaned = cleanBody(body);
    if (cleaned) messages.push({ role: marks[i].role, text: cleaned });
  }

  const cleanText = messages.map((m) => `${m.role === "user" ? "You" : "Assistant"}: ${m.text}`).join("\n\n");
  const tail = takeTail(messages, TAIL_CHARS);

  const facts = extractFacts(messages);
  const highlights: string[] = [
    ...facts.tests.map((t) => `${t.lift}: ${t.kg} kg`),
    ...(facts.pressSessionsDone !== null ? [`Press sessions logged: ${facts.pressSessionsDone}`] : []),
    ...(facts.legSessionsDone !== null ? [`Leg sessions logged: ${facts.legSessionsDone}`] : []),
    ...facts.limitations,
  ];

  return { exportedAt, messages, cleanText: cleanText.slice(-KEEP_CHARS), tail, facts, highlights };
}

function takeTail(messages: ParsedMessage[], maxChars: number): string {
  const parts: string[] = [];
  let total = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    const block = `${m.role === "user" ? "You" : "Assistant"}: ${m.text}`;
    if (total + block.length > maxChars && parts.length > 0) break;
    parts.unshift(block);
    total += block.length;
    if (total >= maxChars) break;
  }
  return parts.join("\n\n");
}

function extractFacts(messages: ParsedMessage[]): ExtractedFacts {
  const tests = new Map<string, number>();
  let pressSessionsDone: number | null = null;
  let legSessionsDone: number | null = null;
  const limitations = new Set<string>();

  for (const m of messages.slice(-80)) {
    if (m.role !== "user") continue;
    const t = m.text.replace(/\s+/g, " ");

    for (const match of t.matchAll(/MY\s+([A-Z ]{2,40}?)\s+MAX\s+IS\s+(\d+(?:\.\d+)?)\s*KG/gi)) {
      tests.set(liftName(match[1]), Number(match[2]));
    }
    for (const match of t.matchAll(/I\s+(?:DID|HIT)\s+(\d+(?:\.\d+)?)\s*KG\s+(?:FOR|ON)\s+THE\s+([A-Z]+)/gi)) {
      tests.set(liftName(match[2]), Number(match[1]));
    }
    const press = t.match(/WE\s+ALREADY\s+DID\s+(\d+)/i);
    if (press) pressSessionsDone = Number(press[1]);
    const legs = t.match(/(?:FIRST\s+)?(\d+)\s+LEG\s+WORKOUTS?\s+(?:ARE|IS)\s+DONE/i);
    if (legs) legSessionsDone = Number(legs[1]);
    if (/NO\s+SPACE\s+TO\s+SPRINT|TRAIN\s+(?:THE|AT)\s+HOUSE|TRAIN\s+AT\s+HOME/i.test(t)) {
      limitations.add("No sprint space at home — in-place or band-resisted sprints only");
    }
    if (/SQUAT\s+(?:IS\s+)?UNTESTED|SWITCHED\s+THE\s+BACK\s*SQUAT|SWAPPED\s+THE\s+SQUAT/i.test(t)) {
      limitations.add("Back squat untested — lunge is the current lower-body lift");
    }
  }

  return {
    tests: [...tests.entries()].map(([lift, kg]) => ({ lift, kg })),
    pressSessionsDone,
    legSessionsDone,
    limitations: [...limitations],
  };
}