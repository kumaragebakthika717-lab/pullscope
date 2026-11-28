import {
  findAttribute,
  normalizeName,
  type AttributeId,
  type InputRow,
} from "./technicality";

export interface ParseResult {
  rows: InputRow[];
  warnings: string[];
  errors: string[];
}

const BLANK_TOKENS = new Set(["", "-", "–", "—", "n/a", "na", "none", "null", "blank", "unrated", "u", "?"]);
const GREEN_TOKENS = new Set(["g", "green", "good", "+1", "1", "positive"]);
const RED_TOKENS = new Set(["r", "red", "bad", "-1", "−1", "negative"]);
const BLACK_TOKENS = new Set(["b", "black", "neutral", "n", "0", "even"]);
const PULLER_KEYS = ["puller", "name", "athlete", "player"];
const MATCH_KEYS = ["match", "match id", "matchid", "card", "event"];
const METADATA_KEYS = new Set([
  "puller",
  "name",
  "athlete",
  "player",
  "match",
  "card",
  "matchid",
  "match id",
  "event",
  "date",
  "notes",
  "note",
  "opponent",
  "round",
  "timestamp",
  "id",
  "source",
]);

/** 1 = green, 0 = black, -1 = red, null = blank/unrated, undefined = unrecognized. */
export function parseRatingToken(value: unknown): number | null | undefined {
  if (typeof value === "number") {
    return value === 1 || value === 0 || value === -1 ? value : undefined;
  }
  if (typeof value !== "string") return undefined;
  const token = value.trim().toLowerCase();
  if (BLANK_TOKENS.has(token)) return null;
  if (GREEN_TOKENS.has(token)) return 1;
  if (RED_TOKENS.has(token)) return -1;
  if (BLACK_TOKENS.has(token)) return 0;
  return undefined;
}

interface RawRow {
  puller: string;
  match: string;
  ratings: Partial<Record<AttributeId, number>>;
  rowNumber: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickString(record: Record<string, unknown>, keys: string[]): string {
  const wanted = new Set(keys.map(normalizeName));
  for (const [key, value] of Object.entries(record)) {
    if (!wanted.has(normalizeName(key))) continue;
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function collectRatings(
  values: Record<string, unknown>,
  puller: string,
  match: string,
  rowNumber: number,
  warnings: string[],
): Partial<Record<AttributeId, number>> {
  const ratings: Partial<Record<AttributeId, number>> = {};
  for (const [column, raw] of Object.entries(values)) {
    const attribute = findAttribute(column);
    if (!attribute) {
      const normalized = normalizeName(column);
      if (normalized === "strap") {
        warnings.push(
          `Row ${rowNumber} (${puller}${match ? `, ${match}` : ""}): "strap" is the blueprint's unresolved 20th attribute and overlaps "Out of strap"; it was not scored.`,
        );
      } else if (!METADATA_KEYS.has(normalized)) {
        warnings.push(
          `Row ${rowNumber} (${puller}${match ? `, ${match}` : ""}): column "${column}" is not one of the 19 model attributes; ignored.`,
        );
      }
      continue;
    }
    const parsed = parseRatingToken(raw);
    if (parsed === undefined) {
      warnings.push(
        `Row ${rowNumber} (${puller}${match ? `, ${match}` : ""}): "${String(raw)}" on ${attribute.label} is not a rating; treated as blank.`,
      );
      continue;
    }
    if (parsed !== null) ratings[attribute.id] = parsed;
  }
  return ratings;
}

function parseJson(text: string, warnings: string[], errors: string[]): RawRow[] | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    errors.push(`Input looks like JSON but could not be parsed: ${(error as Error).message}`);
    return null;
  }

  let items: unknown[];
  if (Array.isArray(data)) {
    items = data;
  } else if (isRecord(data) && Array.isArray(data.rows)) {
    items = data.rows;
  } else if (isRecord(data) && Array.isArray(data.pullers)) {
    items = data.pullers;
  } else if (isRecord(data) && Array.isArray(data.data)) {
    items = data.data;
  } else if (
    isRecord(data) &&
    !Object.keys(data).some((key) => PULLER_KEYS.map(normalizeName).includes(normalizeName(key)))
  ) {
    // { "Oleg": { "match": "...", "Fingers": "G" }, ... }
    items = Object.entries(data).map(([puller, value]) =>
      isRecord(value) ? { puller, ...value } : { puller, ratings: {} },
    );
  } else {
    items = [data];
  }

  const rows: RawRow[] = [];
  items.forEach((item, index) => {
    const rowNumber = index + 1;
    if (!isRecord(item)) {
      warnings.push(`Row ${rowNumber}: expected an object; skipped.`);
      return;
    }
    const puller = pickString(item, PULLER_KEYS);
    if (!puller) {
      errors.push(`Row ${rowNumber}: no puller/name field.`);
      return;
    }
    const match = pickString(item, MATCH_KEYS);
    const nested = item.ratings ?? item.attributes ?? item.scores ?? item.values;
    const values = isRecord(nested) ? nested : item;
    const ratings = collectRatings(values, puller, match, rowNumber, warnings);
    if (Object.keys(ratings).length === 0) {
      warnings.push(`Row ${rowNumber} (${puller}): no recognized attribute ratings.`);
    }
    rows.push({ puller, match, ratings, rowNumber });
  });
  return rows;
}

function splitDelimitedLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (character === delimiter && !quoted) {
      cells.push(current);
      current = "";
      continue;
    }
    current += character;
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function detectDelimiter(header: string): string | null {
  const counts = [
    { delimiter: "\t", count: header.split("\t").length - 1 },
    { delimiter: ",", count: header.split(",").length - 1 },
    { delimiter: ";", count: header.split(";").length - 1 },
  ].sort((a, b) => b.count - a.count);
  return counts[0].count > 0 ? counts[0].delimiter : null;
}

function parseDelimited(text: string, warnings: string[], errors: string[]): RawRow[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    errors.push("A table needs a header row and at least one data row.");
    return [];
  }
  const delimiter = detectDelimiter(lines[0]);
  if (!delimiter) {
    errors.push("Could not detect a tab, comma, or semicolon delimiter in the header.");
    return [];
  }

  const header = splitDelimitedLine(lines[0].replace(/^\uFEFF/, ""), delimiter);
  let pullerIndex = -1;
  let matchIndex = -1;
  const attributeColumns: { index: number; id: AttributeId; label: string }[] = [];
  const seen = new Set<AttributeId>();

  header.forEach((column, index) => {
    const normalized = normalizeName(column);
    if (pullerIndex === -1 && PULLER_KEYS.includes(normalized)) {
      pullerIndex = index;
      return;
    }
    if (matchIndex === -1 && MATCH_KEYS.includes(normalized)) {
      matchIndex = index;
      return;
    }
    const attribute = findAttribute(column);
    if (attribute) {
      if (seen.has(attribute.id)) {
        warnings.push(`Duplicate column "${column}" for ${attribute.label}; only the first is used.`);
        return;
      }
      seen.add(attribute.id);
      attributeColumns.push({ index, id: attribute.id, label: attribute.label });
      return;
    }
    if (normalized === "strap") {
      warnings.push(
        `Column "strap" is the blueprint's unresolved 20th attribute and overlaps "Out of strap"; it was not scored.`,
      );
      return;
    }
    if (!METADATA_KEYS.has(normalized) && normalized) {
      warnings.push(`Column "${column}" is not one of the 19 model attributes; ignored.`);
    }
  });

  if (pullerIndex === -1) {
    errors.push('The table header needs a "puller" (or "name") column.');
    return [];
  }
  if (attributeColumns.length === 0) {
    errors.push("The table header has no recognized attribute columns.");
    return [];
  }

  const rows: RawRow[] = [];
  lines.slice(1).forEach((line, lineIndex) => {
    const rowNumber = lineIndex + 2;
    const cells = splitDelimitedLine(line, delimiter);
    const puller = (cells[pullerIndex] ?? "").trim();
    if (!puller) {
      warnings.push(`Line ${rowNumber}: no puller value; skipped.`);
      return;
    }
    const match = matchIndex >= 0 ? (cells[matchIndex] ?? "").trim() : "";
    const ratings: Partial<Record<AttributeId, number>> = {};
    for (const column of attributeColumns) {
      const parsed = parseRatingToken(cells[column.index] ?? "");
      if (parsed === undefined) {
        warnings.push(
          `Line ${rowNumber} (${puller}): "${cells[column.index]}" on ${column.label} is not a rating; treated as blank.`,
        );
        continue;
      }
      if (parsed !== null) ratings[column.id] = parsed;
    }
    rows.push({ puller, match, ratings, rowNumber });
  });
  return rows;
}

function mergeAndLabel(rows: RawRow[], warnings: string[]): InputRow[] {
  const merged: RawRow[] = [];
  const byKey = new Map<string, RawRow>();
  for (const row of rows) {
    if (!row.match) {
      merged.push(row);
      continue;
    }
    const key = `${normalizeName(row.puller)}||${normalizeName(row.match)}`;
    const existing = byKey.get(key);
    if (!existing) {
      const copy = { ...row, ratings: { ...row.ratings } };
      byKey.set(key, copy);
      merged.push(copy);
      continue;
    }
    let conflicted = false;
    for (const [attribute, value] of Object.entries(row.ratings) as [AttributeId, number][]) {
      if (typeof value !== "number") continue;
      if (typeof existing.ratings[attribute] === "number" && existing.ratings[attribute] !== value) {
        conflicted = true;
      }
      existing.ratings[attribute] = value;
    }
    warnings.push(
      `Duplicate row for ${row.puller} / ${row.match}; merged with the later value winning${conflicted ? " (conflicting ratings found)" : ""}.`,
    );
  }

  const counters = new Map<string, number>();
  for (const row of merged) {
    if (row.match) continue;
    const key = normalizeName(row.puller);
    const next = (counters.get(key) ?? 0) + 1;
    counters.set(key, next);
    row.match = `Unlabelled match ${next}`;
  }

  const names = new Map<string, Set<string>>();
  for (const row of merged) {
    const key = normalizeName(row.puller);
    const set = names.get(key) ?? new Set<string>();
    set.add(row.puller.trim());
    names.set(key, set);
  }
  for (const variants of names.values()) {
    if (variants.size > 1) {
      warnings.push(`Merged puller name variants: ${[...variants].join(" / ")}.`);
    }
  }

  return merged.map((row) => ({ puller: row.puller.trim(), match: row.match, ratings: row.ratings }));
}

export function parseTechnicalityInput(text: string): ParseResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const trimmed = text.trim();
  if (!trimmed) return { rows: [], warnings, errors };

  let raw: RawRow[] | null;
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    raw = parseJson(trimmed, warnings, errors);
  } else {
    raw = parseDelimited(trimmed, warnings, errors);
  }

  if (!raw || raw.length === 0) {
    if (errors.length === 0) errors.push("No data rows found.");
    return { rows: [], warnings, errors };
  }

  const rows = mergeAndLabel(raw, warnings);
  if (rows.length === 0) errors.push("No usable rows after parsing.");
  return { rows, warnings, errors };
}