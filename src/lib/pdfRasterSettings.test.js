import { describe, it, expect } from "vitest";
import {
  DPI_PRESETS,
  findDpiPreset,
  planPageRaster,
  describeRasterSize,
  describeClamp,
  pageImageName,
  rasterExtension,
} from "./pdfRasterSettings";
import { MAX_CANVAS_PIXELS } from "./imageValidation";

// A4 in points, the size most test pages actually are.
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;

describe("findDpiPreset", () => {
  it("finds each preset by id", () => {
    expect(findDpiPreset("screen").dpi).toBe(72);
    expect(findDpiPreset("print").dpi).toBe(300);
  });

  it("falls back to the standard preset rather than undefined", () => {
    expect(findDpiPreset("ultra").dpi).toBe(150);
    expect(findDpiPreset(undefined).dpi).toBe(150);
  });
});

describe("planPageRaster", () => {
  it("renders 1:1 at 72 DPI, since a point is 1/72 inch", () => {
    const plan = planPageRaster(A4_WIDTH, A4_HEIGHT, 72);
    expect(plan.scale).toBe(1);
    expect(plan.width).toBe(595);
    expect(plan.height).toBe(841);
    expect(plan.clamped).toBe(false);
  });

  it("doubles the scale at 144 DPI", () => {
    const plan = planPageRaster(A4_WIDTH, A4_HEIGHT, 144);
    expect(plan.scale).toBe(2);
  });

  it("produces the expected A4 pixel sizes at each preset", () => {
    // These are the numbers shown next to the DPI options, so they're worth
    // pinning: a wrong figure here misleads the user about what they'll get.
    expect(planPageRaster(A4_WIDTH, A4_HEIGHT, 150).width).toBe(1240);
    expect(planPageRaster(A4_WIDTH, A4_HEIGHT, 150).height).toBe(1753);
    expect(planPageRaster(A4_WIDTH, A4_HEIGHT, 300).width).toBe(2480);
  });

  it("stays under the canvas ceiling at 300 DPI on A4", () => {
    const plan = planPageRaster(A4_WIDTH, A4_HEIGHT, 300);
    expect(plan.width * plan.height).toBeLessThanOrEqual(MAX_CANVAS_PIXELS);
    expect(plan.clamped).toBe(false);
  });

  it("clamps an oversized page instead of returning a blank render", () => {
    // The failure this exists to prevent: past the ceiling, canvas does not
    // throw — it hands back a blank surface, so the user downloads a zip of
    // white images with no error anywhere.
    const plan = planPageRaster(A4_WIDTH * 2, A4_HEIGHT * 2, 300);

    expect(plan.clamped).toBe(true);
    expect(plan.width * plan.height).toBeLessThanOrEqual(MAX_CANVAS_PIXELS);
    expect(plan.effectiveDpi).toBeLessThan(300);
    expect(plan.requestedDpi).toBe(300);
  });

  it("preserves aspect ratio when clamping", () => {
    const plan = planPageRaster(A4_WIDTH * 3, A4_HEIGHT * 3, 300);
    expect(plan.width / plan.height).toBeCloseTo(A4_WIDTH / A4_HEIGHT, 2);
  });

  it("never returns a zero dimension", () => {
    // A zero-width canvas throws on render, so a tiny page at a low DPI must
    // still floor to at least one pixel.
    const plan = planPageRaster(0.5, 0.5, 72);
    expect(plan.width).toBeGreaterThanOrEqual(1);
    expect(plan.height).toBeGreaterThanOrEqual(1);
  });

  it("survives non-finite inputs", () => {
    for (const bad of [0, -10, NaN, Infinity, undefined]) {
      const plan = planPageRaster(bad, bad, bad);
      expect(Number.isFinite(plan.scale)).toBe(true);
      expect(plan.width).toBeGreaterThanOrEqual(1);
      expect(plan.height).toBeGreaterThanOrEqual(1);
    }
  });

  it("keeps every preset under the ceiling for a normal page", () => {
    for (const preset of DPI_PRESETS) {
      const plan = planPageRaster(A4_WIDTH, A4_HEIGHT, preset.dpi);
      expect(plan.width * plan.height, preset.id).toBeLessThanOrEqual(MAX_CANVAS_PIXELS);
    }
  });
});

describe("describeRasterSize", () => {
  it("formats the output dimensions", () => {
    expect(describeRasterSize(planPageRaster(A4_WIDTH, A4_HEIGHT, 150))).toBe("1240 × 1753 px");
  });

  it("returns an empty string with no plan", () => {
    expect(describeRasterSize(null)).toBe("");
  });
});

describe("describeClamp", () => {
  it("says nothing when nothing was clamped", () => {
    expect(describeClamp(planPageRaster(A4_WIDTH, A4_HEIGHT, 150))).toBe("");
  });

  it("names both the requested and the achievable DPI", () => {
    // A user who asked for 300 and got 190 can't fix it — but they should at
    // least know it happened and why.
    const message = describeClamp(planPageRaster(A4_WIDTH * 3, A4_HEIGHT * 3, 300));
    expect(message).toContain("300 DPI");
    expect(message).toMatch(/about \d+ DPI/);
  });
});

describe("pageImageName", () => {
  it("zero-pads to the document's page count so files sort correctly", () => {
    // Without padding "page-10.jpg" sorts before "page-2.jpg" and the zip
    // looks shuffled, which reads as a broken tool.
    expect(pageImageName("report", 2, 120)).toBe("report-002.jpg");
    expect(pageImageName("report", 120, 120)).toBe("report-120.jpg");
  });

  it("does not pad a single-digit document", () => {
    expect(pageImageName("memo", 3, 9)).toBe("memo-3.jpg");
  });

  it("strips the source extension from the stem", () => {
    expect(pageImageName("contract.pdf", 1, 1)).toBe("contract-1.jpg");
  });

  it("honours the output extension", () => {
    expect(pageImageName("doc", 1, 1, "png")).toBe("doc-1.png");
  });

  it("falls back to a usable stem", () => {
    expect(pageImageName("", 1, 1)).toBe("page-1.jpg");
    expect(pageImageName(null, 1, 1)).toBe("page-1.jpg");
  });
});

describe("rasterExtension", () => {
  it("maps the offered formats", () => {
    expect(rasterExtension("image/jpeg")).toBe("jpg");
    expect(rasterExtension("image/png")).toBe("png");
  });

  it("defaults to jpg for anything else", () => {
    expect(rasterExtension("image/webp")).toBe("jpg");
  });
});
