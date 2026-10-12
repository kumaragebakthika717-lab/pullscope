import { describe, expect, it, vi } from "vitest";
import { DEMO_CARD } from "@/lib/demo-card";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/card", () => ({ getPublicCard: async (slug: string) => (slug === "demo" ? DEMO_CARD : null) }));
vi.stubGlobal("fetch", async () => new Response(null, { status: 404 }));

const { GET } = await import("./route");

describe("GET /card/[slug]/png", () => {
  it("renders a PNG for a card", { timeout: 60_000 }, async () => {
    const t0 = performance.now();
    const res = await GET(new Request("http://x/card/demo/png?download=1"), { params: Promise.resolve({ slug: "demo" }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("content-disposition")).toMatch(/attachment; filename="pullscope-EVW-17/);
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(bytes.length).toBeGreaterThan(10_000);
    console.log(`rendered ${bytes.length} bytes in ${Math.round(performance.now() - t0)}ms`);
  });

  it("404s for an unknown slug", async () => {
    const res = await GET(new Request("http://x/card/nope1/png"), { params: Promise.resolve({ slug: "nope1" }) });
    expect(res.status).toBe(404);
  });
});
