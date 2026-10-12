import { describe, expect, it } from "vitest";
import { computeVerdict } from "@/lib/verdict";
import { formatTimecode } from "@/lib/timecode";
import { parseYoutubeId } from "@/lib/youtube";
import { DEMO_CARD } from "@/lib/demo-card";

describe("computeVerdict", () => {
  it("is unrated with no annotations", () => {
    expect(computeVerdict([])).toBe("unrated");
  });

  it("prefers the highest round over a later timestamp", () => {
    expect(
      computeVerdict([
        { round_number: 2, timestamp_sec: 10, rating: "green" },
        { round_number: 1, timestamp_sec: 99, rating: "red" },
      ]),
    ).toBe("green");
  });

  it("uses the latest timestamp within the same round", () => {
    expect(
      computeVerdict([
        { round_number: 1, timestamp_sec: 50, rating: "red" },
        { round_number: 1, timestamp_sec: 10, rating: "green" },
      ]),
    ).toBe("red");
  });

  it("ranks Overall (0) above numbered rounds", () => {
    expect(
      computeVerdict([
        { round_number: 5, timestamp_sec: 100, rating: "red" },
        { round_number: 0, timestamp_sec: 1, rating: "black" },
      ]),
    ).toBe("black");
  });
});

describe("formatTimecode", () => {
  it("formats frames at 30fps without float drift", () => {
    expect(formatTimecode(3, 30)).toBe("00:03:00");
    expect(formatTimecode(61.5, 30)).toBe("01:01:15");
    expect(formatTimecode(0.1 + 0.2, 30)).toBe("00:00:09");
  });
});

describe("parseYoutubeId", () => {
  it.each([
    "https://www.youtube.com/watch?v=wBRBQlVCn1U",
    "https://youtu.be/wBRBQlVCn1U",
    "https://www.youtube.com/shorts/wBRBQlVCn1U",
  ])("parses %s", (url) => {
    expect(parseYoutubeId(url)).toBe("wBRBQlVCn1U");
  });
});

describe("demo card", () => {
  it("matches the seeded analysis", () => {
    expect(DEMO_CARD.left.totals).toMatchObject({ green: 2, red: 0 });
    expect(DEMO_CARD.right.totals).toMatchObject({ green: 1, red: 3 });
  });
});
