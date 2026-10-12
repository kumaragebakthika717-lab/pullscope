import { readFile } from "node:fs/promises";
import path from "node:path";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { getPublicCard, type PublicCard } from "@/lib/card";
import { RATING_COLORS } from "@/lib/constants";
import type { AttributeRow, PullerSummary, Verdict } from "@/lib/verdict";

export const runtime = "nodejs";

const WIDTH = 1200;
const ROW_H = 44;
const COLORS = {
  bg: "#0a0a0b",
  panel: "#141416",
  border: "#26262a",
  text: "#f4f4f5",
  muted: "#a1a1aa",
  accent: "#f59e0b",
};
const VERDICT_COLOR: Record<Verdict, string> = { ...RATING_COLORS, unrated: "#26262a" };
const VERDICT_LABEL: Record<Verdict, string> = { green: "GOOD", red: "BAD", black: "NEUTRAL", unrated: "—" };

type Font = { name: string; data: Buffer; weight: 400 | 600 | 700 | 800; style: "normal" };
let fontsPromise: Promise<Font[]> | null = null;

function loadFonts() {
  fontsPromise ??= (async () => {
    const root = path.join(process.cwd(), "node_modules", "@fontsource");
    const specs: [string, string, Font["weight"]][] = [
      ["Inter", "inter/files/inter-latin-400-normal.woff", 400],
      ["Inter", "inter/files/inter-latin-600-normal.woff", 600],
      ["Inter", "inter/files/inter-latin-700-normal.woff", 700],
      ["Inter", "inter/files/inter-latin-ext-400-normal.woff", 400],
      ["Inter", "inter/files/inter-latin-ext-700-normal.woff", 700],
      ["Barlow", "barlow-condensed/files/barlow-condensed-latin-700-normal.woff", 700],
      ["Barlow", "barlow-condensed/files/barlow-condensed-latin-800-normal.woff", 800],
      ["Barlow", "barlow-condensed/files/barlow-condensed-latin-ext-700-normal.woff", 700],
      ["Barlow", "barlow-condensed/files/barlow-condensed-latin-ext-800-normal.woff", 800],
    ];
    return Promise.all(
      specs.map(async ([name, file, weight]) => ({
        name,
        weight,
        style: "normal" as const,
        data: await readFile(path.join(root, file)),
      })),
    );
  })().catch((e) => {
    fontsPromise = null;
    throw e;
  });
  return fontsPromise;
}

async function fetchAsDataUrl(url: string) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:${res.headers.get("content-type") ?? "image/jpeg"};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

function Dot({ color, size = 14 }: { color: string; size?: number }) {
  return <div style={{ width: size, height: size, borderRadius: size, background: color, display: "flex" }} />;
}

function Tally({ summary, align }: { summary: PullerSummary; align: "left" | "right" }) {
  const items: [Verdict, number][] = [
    ["green", summary.totals.green],
    ["red", summary.totals.red],
    ["black", summary.totals.black],
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: align === "left" ? "flex-start" : "flex-end" }}>
      <div style={{ fontFamily: "Barlow", fontWeight: 800, fontSize: 40, lineHeight: 1.05, color: COLORS.text }}>
        {summary.name.toUpperCase()}
      </div>
      <div style={{ display: "flex", gap: 18, marginTop: 10 }}>
        {items.map(([v, n]) => (
          <div key={v} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Dot color={VERDICT_COLOR[v]} size={16} />
            <div style={{ fontSize: 24, fontWeight: 700, color: COLORS.text }}>{n}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Row({ row, index }: { row: AttributeRow; index: number }) {
  const { counts, verdict } = row;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        height: ROW_H,
        padding: "0 16px",
        background: index % 2 ? COLORS.panel : "transparent",
        borderTop: `1px solid ${COLORS.border}`,
      }}
    >
      <div style={{ display: "flex", flex: 1, fontSize: 17, fontWeight: 600, color: COLORS.text, overflow: "hidden" }}>
        {row.attribute.name}
      </div>
      <div style={{ display: "flex", gap: 10, fontSize: 14, color: COLORS.muted, marginRight: 14 }}>
        {(["green", "red", "black"] as const).map((r) => (
          <div key={r} style={{ display: "flex", alignItems: "center", gap: 4, opacity: counts[r] ? 1 : 0.35 }}>
            <Dot color={RATING_COLORS[r]} size={9} />
            <div>{counts[r]}</div>
          </div>
        ))}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          width: 96,
          padding: "5px 0",
          borderRadius: 6,
          background: VERDICT_COLOR[verdict],
          color: verdict === "unrated" ? COLORS.muted : "#ffffff",
          fontFamily: "Barlow",
          fontWeight: 700,
          fontSize: 16,
          letterSpacing: 1,
        }}
      >
        {VERDICT_LABEL[verdict]}
      </div>
    </div>
  );
}

function Table({ summary }: { summary: PullerSummary }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 48,
          padding: "0 16px",
          background: COLORS.panel,
        }}
      >
        <div style={{ display: "flex", fontFamily: "Barlow", fontWeight: 800, fontSize: 22, color: COLORS.text }}>
          {summary.name.toUpperCase()}
        </div>
        <div style={{ display: "flex", fontSize: 13, color: COLORS.muted, letterSpacing: 1 }}>
          {summary.side === "left" ? "LEFT" : "RIGHT"}
        </div>
      </div>
      {summary.rows.map((row, i) => (
        <Row key={row.attribute.id} row={row} index={i} />
      ))}
    </div>
  );
}

function CardImage({ card, thumb }: { card: PublicCard; thumb: string | null }) {
  const { match, left, right } = card;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: WIDTH,
        height: "100%",
        boxSizing: "border-box",
        background: COLORS.bg,
        color: COLORS.text,
        fontFamily: "Inter",
        padding: 40,
        position: "relative",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              display: "flex",
              fontFamily: "Barlow",
              fontWeight: 800,
              fontSize: 26,
              letterSpacing: 1,
              color: COLORS.accent,
            }}
          >
            PULLSCOPE
          </div>
          <div style={{ display: "flex", fontSize: 16, color: COLORS.muted }}>Match Report Card</div>
        </div>
        {match.event_name ? (
          <div style={{ display: "flex", fontSize: 18, fontWeight: 600, color: COLORS.muted }}>{match.event_name}</div>
        ) : null}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 28, marginTop: 28 }}>
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
          <img src={thumb} width={224} height={126} style={{ borderRadius: 10, objectFit: "cover" }} />
        ) : null}
        <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "space-between" }}>
          <Tally summary={left} align="left" />
          <div style={{ display: "flex", fontFamily: "Barlow", fontWeight: 800, fontSize: 30, color: COLORS.accent }}>
            VS
          </div>
          <Tally summary={right} align="right" />
        </div>
      </div>

      <div style={{ display: "flex", marginTop: 18, fontSize: 18, color: COLORS.muted }}>{match.title}</div>

      <div style={{ display: "flex", gap: 24, marginTop: 24 }}>
        <Table summary={left} />
        <Table summary={right} />
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 22,
          fontSize: 15,
          color: COLORS.muted,
        }}
      >
        <div style={{ display: "flex" }}>{card.ownerHandle ? `Analysis by @${card.ownerHandle}` : ""}</div>
        <div style={{ display: "flex" }}>Verdict = latest rating in the latest round</div>
      </div>

      {card.plan === "free" ? (
        <div
          style={{
            display: "flex",
            position: "absolute",
            right: 40,
            bottom: 12,
            fontSize: 14,
            fontWeight: 700,
            color: COLORS.accent,
            opacity: 0.85,
          }}
        >
          Made with PullScope · free plan
        </div>
      ) : null}
    </div>
  );
}

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const card = await getPublicCard(slug, false);
  if (!card) return new Response("Not found", { status: 404 });

  const rows = Math.max(card.left.rows.length, 1);
  const height = 40 + 34 + 28 + 126 + 18 + 26 + 24 + 50 + rows * ROW_H + 22 + 24 + 40 + 6;

  const [fonts, thumb] = await Promise.all([
    loadFonts(),
    card.thumbnail ? fetchAsDataUrl(card.thumbnail) : Promise.resolve(null),
  ]);

  const svg = await satori(<CardImage card={card} thumb={thumb} />, { width: WIDTH, height, fonts });
  const png = new Resvg(svg, { fitTo: { mode: "width", value: WIDTH } }).render().asPng();

  const headers: Record<string, string> = {
    "Content-Type": "image/png",
    "Cache-Control": "public, max-age=60, s-maxage=60",
  };
  if (new URL(req.url).searchParams.get("download") === "1") {
    const safe = card.match.title.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "report-card";
    headers["Content-Disposition"] = `attachment; filename="pullscope-${safe}.png"`;
  }
  return new Response(new Uint8Array(png), { headers });
}
