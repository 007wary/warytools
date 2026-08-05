import { describe, expect, it } from "vitest";
import {
  MIN_TOOL_USES,
  MIN_TOTAL_USES,
  SEARCH_WEIGHT,
  rankTools,
  slugFor,
  trendingScore,
  weightedInterest,
} from "./toolRanking";

const NOW = Date.parse("2026-08-05T12:00:00Z");
const hoursAgo = (h) => new Date(NOW - h * 3_600_000).toISOString();

const tools = [
  { slug: "merge", title: "Merge PDF", href: "/pdf/merge", category: "pdf" },
  { slug: "split", title: "Split PDF", href: "/pdf/split", category: "pdf" },
  { slug: "compress", title: "Compress Image", href: "/image/compress", category: "image" },
  { slug: "resize", title: "Resize Image", href: "/image/resize", category: "image" },
  { slug: "gst", title: "GST Calculator", href: "/calculators/gst", category: "calculators" },
  { slug: "age", title: "Age Calculator", href: "/calculators/age", category: "calculators" },
];

// Enough traffic to clear MIN_TOTAL_USES, spread so every tool clears
// MIN_TOOL_USES — the baseline for tests that care about ordering.
const busyUsage = [
  { tool_slug: "pdf/merge", uses: 40, last_used: hoursAgo(1) },
  { tool_slug: "pdf/split", uses: 30, last_used: hoursAgo(2) },
  { tool_slug: "image/compress", uses: 25, last_used: hoursAgo(3) },
  { tool_slug: "image/resize", uses: 20, last_used: hoursAgo(4) },
  { tool_slug: "calculators/gst", uses: 15, last_used: hoursAgo(5) },
];

describe("trendingScore", () => {
  it("ranks a recent burst above an older one of equal size", () => {
    const recent = trendingScore({ uses: 100, lastUsedAt: hoursAgo(1), now: NOW });
    const stale = trendingScore({ uses: 100, lastUsedAt: hoursAgo(72), now: NOW });
    expect(recent).toBeGreaterThan(stale);
  });

  it("ranks more uses above fewer at the same recency", () => {
    const many = trendingScore({ uses: 200, lastUsedAt: hoursAgo(5), now: NOW });
    const few = trendingScore({ uses: 20, lastUsedAt: hoursAgo(5), now: NOW });
    expect(many).toBeGreaterThan(few);
  });

  it("lets a fresh surge overtake a larger stale count", () => {
    // This is the whole point of decaying: without it, 500 would always win.
    const surge = trendingScore({ uses: 60, lastUsedAt: hoursAgo(1), now: NOW });
    const incumbent = trendingScore({ uses: 500, lastUsedAt: hoursAgo(120), now: NOW });
    expect(surge).toBeGreaterThan(incumbent);
  });

  it("does not blow up for a use in the current instant", () => {
    const score = trendingScore({ uses: 1, lastUsedAt: hoursAgo(0), now: NOW });
    expect(Number.isFinite(score)).toBe(true);
  });

  it("clamps future timestamps rather than scoring them higher", () => {
    const future = trendingScore({ uses: 10, lastUsedAt: hoursAgo(-5), now: NOW });
    const present = trendingScore({ uses: 10, lastUsedAt: hoursAgo(0), now: NOW });
    expect(future).toBe(present);
  });

  it("accepts Date, epoch ms, and ISO string alike", () => {
    const iso = trendingScore({ uses: 10, lastUsedAt: hoursAgo(3), now: NOW });
    const date = trendingScore({ uses: 10, lastUsedAt: new Date(NOW - 3 * 3_600_000), now: NOW });
    const ms = trendingScore({ uses: 10, lastUsedAt: NOW - 3 * 3_600_000, now: NOW });
    expect(date).toBe(iso);
    expect(ms).toBe(iso);
  });

  it("scores zero for junk input instead of returning NaN", () => {
    for (const bad of [null, undefined, "", "not-a-date", Number.NaN]) {
      expect(trendingScore({ uses: 10, lastUsedAt: bad, now: NOW })).toBe(0);
    }
    expect(trendingScore({ uses: 0, lastUsedAt: hoursAgo(1), now: NOW })).toBe(0);
    expect(trendingScore({ uses: -5, lastUsedAt: hoursAgo(1), now: NOW })).toBe(0);
  });
});

describe("rankTools cold start", () => {
  it("falls back to curated order with no data at all", () => {
    const result = rankTools({ usage: [], tools, now: NOW });
    expect(result.mode).toBe("curated");
    expect(result.tools).toEqual(tools.slice(0, 4));
  });

  it("falls back when total traffic is below the section gate", () => {
    const result = rankTools({
      usage: [
        { tool_slug: "pdf/merge", uses: 6, last_used: hoursAgo(1) },
        { tool_slug: "pdf/split", uses: 6, last_used: hoursAgo(1) },
        { tool_slug: "image/compress", uses: 6, last_used: hoursAgo(1) },
        { tool_slug: "image/resize", uses: 6, last_used: hoursAgo(1) },
      ],
      tools,
      now: NOW,
    });
    // 24 total uses — each tool clears MIN_TOOL_USES, but the site as a whole
    // has not earned a "trending" claim yet.
    expect(24).toBeLessThan(MIN_TOTAL_USES);
    expect(result.mode).toBe("curated");
  });

  it("falls back when too few tools individually clear the per-tool floor", () => {
    const result = rankTools({
      usage: [
        { tool_slug: "pdf/merge", uses: 95, last_used: hoursAgo(1) },
        { tool_slug: "pdf/split", uses: 2, last_used: hoursAgo(1) },
        { tool_slug: "image/compress", uses: 2, last_used: hoursAgo(1) },
        { tool_slug: "image/resize", uses: 1, last_used: hoursAgo(1) },
      ],
      tools,
      now: NOW,
    });
    // Plenty of total traffic, but it is one tool's — not a ranking.
    expect(result.mode).toBe("curated");
  });

  it("switches to trending once both gates clear", () => {
    const result = rankTools({ usage: busyUsage, tools, now: NOW });
    expect(result.mode).toBe("trending");
    expect(result.tools).toHaveLength(4);
  });

  it("counts sub-floor tools toward the section gate", () => {
    // Five tools at exactly the floor: 25 uses total, below MIN_TOTAL_USES,
    // so this must stay curated even though every tool clears MIN_TOOL_USES.
    const usage = ["pdf/merge", "pdf/split", "image/compress", "image/resize", "calculators/gst"].map(
      (tool_slug) => ({ tool_slug, uses: MIN_TOOL_USES, last_used: hoursAgo(1) })
    );
    expect(rankTools({ usage, tools, now: NOW }).mode).toBe("curated");
  });
});

describe("rankTools ordering", () => {
  it("puts the highest-scoring tool first", () => {
    const result = rankTools({ usage: busyUsage, tools, now: NOW });
    expect(result.tools[0].href).toBe("/pdf/merge");
  });

  it("surfaces a fresh surge over a stale leader", () => {
    const result = rankTools({
      usage: [
        { tool_slug: "pdf/merge", uses: 400, last_used: hoursAgo(140) },
        { tool_slug: "calculators/gst", uses: 60, last_used: hoursAgo(1) },
        { tool_slug: "pdf/split", uses: 30, last_used: hoursAgo(30) },
        { tool_slug: "image/compress", uses: 25, last_used: hoursAgo(40) },
        { tool_slug: "image/resize", uses: 20, last_used: hoursAgo(50) },
      ],
      tools,
      now: NOW,
    });
    expect(result.mode).toBe("trending");
    expect(result.tools[0].href).toBe("/calculators/gst");
  });

  it("respects an explicit limit", () => {
    const result = rankTools({ usage: busyUsage, tools, now: NOW, limit: 3 });
    expect(result.tools).toHaveLength(3);
  });

  it("returns registry tool objects, not usage rows", () => {
    const [first] = rankTools({ usage: busyUsage, tools, now: NOW }).tools;
    expect(first).toHaveProperty("title");
    expect(first).toHaveProperty("category");
    expect(first).not.toHaveProperty("uses");
  });

  it("is deterministic when scores tie", () => {
    const usage = [
      { tool_slug: "image/resize", uses: 10, last_used: hoursAgo(2) },
      { tool_slug: "pdf/merge", uses: 10, last_used: hoursAgo(2) },
      { tool_slug: "calculators/gst", uses: 10, last_used: hoursAgo(2) },
      { tool_slug: "image/compress", uses: 10, last_used: hoursAgo(2) },
      { tool_slug: "pdf/split", uses: 10, last_used: hoursAgo(2) },
    ];
    const once = rankTools({ usage, tools, now: NOW }).tools.map((t) => t.href);
    const twice = rankTools({ usage: [...usage].reverse(), tools, now: NOW }).tools.map((t) => t.href);
    expect(once).toEqual(twice);
  });
});

describe("rankTools resilience", () => {
  it("drops usage rows with no matching registry tool", () => {
    const result = rankTools({
      usage: [...busyUsage, { tool_slug: "pdf/retired-tool", uses: 9999, last_used: hoursAgo(1) }],
      tools,
      now: NOW,
    });
    expect(result.tools.every((tool) => tools.includes(tool))).toBe(true);
  });

  it("ignores malformed rows without throwing", () => {
    const result = rankTools({
      usage: [
        ...busyUsage,
        null,
        {},
        { tool_slug: "pdf/merge", uses: "lots", last_used: hoursAgo(1) },
        { tool_slug: "image/resize", uses: 12, last_used: null },
      ],
      tools,
      now: NOW,
    });
    expect(result.mode).toBe("trending");
    expect(result.tools).toHaveLength(4);
  });

  it("falls back when handed a non-array", () => {
    expect(rankTools({ usage: null, tools, now: NOW }).mode).toBe("curated");
    expect(rankTools({ usage: undefined, tools, now: NOW }).mode).toBe("curated");
  });

  it("survives being called with no arguments", () => {
    const result = rankTools();
    expect(result.mode).toBe("curated");
    expect(result.tools).toEqual([]);
  });

  it("never returns more tools than exist", () => {
    const result = rankTools({ usage: busyUsage, tools: tools.slice(0, 2), now: NOW });
    expect(result.tools.length).toBeLessThanOrEqual(2);
  });
});

describe("weightedInterest", () => {
  it("weighs a search click below a completed run", () => {
    expect(weightedInterest({ uses: 0, searches: 1 })).toBe(SEARCH_WEIGHT);
    expect(weightedInterest({ uses: 1, searches: 0 })).toBe(1);
    expect(weightedInterest({ uses: 1, searches: 0 })).toBeGreaterThan(
      weightedInterest({ uses: 0, searches: 1 })
    );
  });

  it("sums both signals", () => {
    expect(weightedInterest({ uses: 10, searches: 5 })).toBeCloseTo(10 + 5 * SEARCH_WEIGHT);
  });

  it("treats missing or junk counts as zero", () => {
    expect(weightedInterest({ uses: 10 })).toBe(10);
    expect(weightedInterest({ searches: 10 })).toBeCloseTo(10 * SEARCH_WEIGHT);
    expect(weightedInterest({})).toBe(0);
    expect(weightedInterest({ uses: "lots", searches: null })).toBe(0);
    expect(weightedInterest({ uses: -5, searches: -5 })).toBe(0);
  });
});

describe("search-click signal in ranking", () => {
  it("scores a search-only tool above nothing but below an equal-count run", () => {
    const searchOnly = trendingScore({ uses: 0, searches: 20, lastUsedAt: hoursAgo(2), now: NOW });
    const runOnly = trendingScore({ uses: 20, searches: 0, lastUsedAt: hoursAgo(2), now: NOW });
    expect(searchOnly).toBeGreaterThan(0);
    expect(searchOnly).toBeLessThan(runOnly);
  });

  it("lets heavy search demand lift a tool over a slightly-more-run one", () => {
    const searched = trendingScore({ uses: 10, searches: 40, lastUsedAt: hoursAgo(2), now: NOW });
    const quiet = trendingScore({ uses: 20, searches: 0, lastUsedAt: hoursAgo(2), now: NOW });
    // 10 + 0.4*40 = 26 vs 20 — search demand is real signal, not a tiebreak.
    expect(searched).toBeGreaterThan(quiet);
  });

  it("does not let search clicks alone outrank a strong run count", () => {
    const searched = trendingScore({ uses: 0, searches: 50, lastUsedAt: hoursAgo(2), now: NOW });
    const used = trendingScore({ uses: 30, searches: 0, lastUsedAt: hoursAgo(2), now: NOW });
    expect(used).toBeGreaterThan(searched);
  });

  it("ranks a search-driven tool into the list", () => {
    const result = rankTools({
      usage: [
        { tool_slug: "pdf/merge", uses: 30, searches: 0, last_used: hoursAgo(2) },
        { tool_slug: "image/convert", uses: 2, searches: 60, last_used: hoursAgo(1) },
        { tool_slug: "pdf/split", uses: 20, searches: 2, last_used: hoursAgo(3) },
        { tool_slug: "image/compress", uses: 15, searches: 5, last_used: hoursAgo(4) },
        { tool_slug: "calculators/gst", uses: 12, searches: 0, last_used: hoursAgo(5) },
      ],
      tools: [...tools, { slug: "convert", title: "Convert Image", href: "/image/convert", category: "image" }],
      now: NOW,
    });
    expect(result.mode).toBe("trending");
    // 2 + 0.4*60 = 26 weighted interest, and the freshest — should lead.
    expect(result.tools[0].href).toBe("/image/convert");
  });

  it("clears the per-tool gate on search clicks alone", () => {
    // 0 runs but 20 clicks = 8.0 weighted, above MIN_TOOL_USES of 5. The gate
    // must not silently exclude the search-heavy tools it exists to surface.
    const usage = [
      { tool_slug: "image/convert", uses: 0, searches: 20, last_used: hoursAgo(1) },
      { tool_slug: "pdf/merge", uses: 30, searches: 0, last_used: hoursAgo(2) },
      { tool_slug: "pdf/split", uses: 20, searches: 0, last_used: hoursAgo(3) },
      { tool_slug: "image/compress", uses: 15, searches: 0, last_used: hoursAgo(4) },
    ];
    const result = rankTools({
      usage,
      tools: [...tools, { slug: "convert", title: "Convert Image", href: "/image/convert", category: "image" }],
      now: NOW,
    });
    expect(result.mode).toBe("trending");
    expect(result.tools.map((t) => t.href)).toContain("/image/convert");
  });

  it("still ranks correctly when no search data exists at all", () => {
    // Rows predating the searches column arrive with the field undefined.
    const result = rankTools({ usage: busyUsage, tools, now: NOW });
    expect(result.mode).toBe("trending");
    expect(result.tools[0].href).toBe("/pdf/merge");
  });

  it("counts weighted search interest toward the section gate", () => {
    // 100 clicks = 40.0 weighted, exactly MIN_TOTAL_USES, spread so four
    // tools each clear the per-tool floor.
    const usage = [
      { tool_slug: "pdf/merge", uses: 0, searches: 25, last_used: hoursAgo(1) },
      { tool_slug: "pdf/split", uses: 0, searches: 25, last_used: hoursAgo(1) },
      { tool_slug: "image/compress", uses: 0, searches: 25, last_used: hoursAgo(1) },
      { tool_slug: "image/resize", uses: 0, searches: 25, last_used: hoursAgo(1) },
    ];
    expect(100 * SEARCH_WEIGHT).toBeGreaterThanOrEqual(MIN_TOTAL_USES);
    expect(rankTools({ usage, tools, now: NOW }).mode).toBe("trending");
  });
});

describe("slugFor", () => {
  it("strips the leading slash so hrefs match currentToolSlug output", () => {
    expect(slugFor({ href: "/pdf/merge" })).toBe("pdf/merge");
    expect(slugFor({ href: "/url-shortener" })).toBe("url-shortener");
  });

  it("returns an empty string for a tool with no usable href", () => {
    expect(slugFor({})).toBe("");
    expect(slugFor(null)).toBe("");
  });
});
