import { describe, it, expect } from "vitest";
import {
  planDownscaleSteps,
  resolveTargetSize,
  linkedDimension,
  clampQuality,
  encoderFor,
  needsMatte,
  extensionFor,
  outputFilename,
} from "./imageResampling";

describe("planDownscaleSteps", () => {
  // The quality bug this fixes: drawImage from 4000px straight to 400px asks
  // the browser to build each output pixel from a 10x10 source block, but its
  // bilinear filter only samples 2x2. Most source pixels are never read, which
  // is why the old resize output looked jagged on fine detail.
  it("halves repeatedly on a large downscale", () => {
    const steps = planDownscaleSteps(4000, 4000, 400, 400);
    expect(steps.length).toBeGreaterThan(1);
    expect(steps[steps.length - 1]).toEqual({ width: 400, height: 400 });
  });

  it("never steps below the target", () => {
    const steps = planDownscaleSteps(4000, 3000, 400, 300);
    steps.forEach((step) => {
      expect(step.width).toBeGreaterThanOrEqual(400);
      expect(step.height).toBeGreaterThanOrEqual(300);
    });
  });

  it("keeps every step at most half the previous one", () => {
    const steps = planDownscaleSteps(4000, 4000, 250, 250);
    let previous = 4000;
    steps.forEach((step) => {
      expect(step.width).toBeGreaterThanOrEqual(previous / 2);
      previous = step.width;
    });
  });

  // A modest downscale is already accurate in one draw, so extra steps would
  // just cost time and compound rounding.
  it("uses a single step when the target is more than half the source", () => {
    expect(planDownscaleSteps(1000, 1000, 800, 800)).toEqual([{ width: 800, height: 800 }]);
  });

  it("uses a single step for an exact halving", () => {
    expect(planDownscaleSteps(1000, 1000, 500, 500)).toEqual([{ width: 500, height: 500 }]);
  });

  it("uses a single step when upscaling", () => {
    expect(planDownscaleSteps(400, 400, 800, 800)).toEqual([{ width: 800, height: 800 }]);
  });

  it("uses a single step when the size is unchanged", () => {
    expect(planDownscaleSteps(500, 500, 500, 500)).toEqual([{ width: 500, height: 500 }]);
  });

  // The loop halves both dimensions together, so a resize that collapses only
  // one axis must not spin forever waiting for the other to shrink.
  it("terminates on a one-dimensional downscale", () => {
    const steps = planDownscaleSteps(4000, 100, 100, 100);
    expect(steps[steps.length - 1]).toEqual({ width: 100, height: 100 });
    expect(steps.length).toBeLessThan(20);
  });

  it("always ends at exactly the target", () => {
    const cases = [
      [4000, 3000, 137, 103],
      [1920, 1080, 16, 9],
      [800, 600, 799, 599],
    ];
    cases.forEach(([fw, fh, tw, th]) => {
      const steps = planDownscaleSteps(fw, fh, tw, th);
      expect(steps[steps.length - 1]).toEqual({ width: tw, height: th });
    });
  });

  it("returns a usable single step for nonsense input rather than throwing", () => {
    expect(planDownscaleSteps(NaN, NaN, 100, 100)).toEqual([{ width: 100, height: 100 }]);
    expect(planDownscaleSteps(100, 100, 0, 0)).toEqual([{ width: 1, height: 1 }]);
  });
});

describe("resolveTargetSize", () => {
  const source = { originalWidth: 1000, originalHeight: 500 };

  it("resolves explicit dimensions", () => {
    const result = resolveTargetSize({ mode: "dimensions", width: "400", height: "200", ...source });
    expect(result).toMatchObject({ ok: true, width: 400, height: 200, isUpscale: false });
  });

  it("resolves a percentage", () => {
    const result = resolveTargetSize({ mode: "percentage", percentage: 50, ...source });
    expect(result).toMatchObject({ ok: true, width: 500, height: 250 });
  });

  // The Number("") trap: a cleared box coerces to 0, which the old code
  // treated as a deliberate zero and drove the partner field to 0 as well.
  it("rejects a cleared width instead of treating it as zero", () => {
    const result = resolveTargetSize({ mode: "dimensions", width: "", height: "200", ...source });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/both a width and a height/);
  });

  it("rejects a cleared height", () => {
    expect(resolveTargetSize({ mode: "dimensions", width: "400", height: "", ...source }).ok).toBe(
      false
    );
  });

  it("rejects whitespace-only input", () => {
    expect(resolveTargetSize({ mode: "dimensions", width: "  ", height: "200", ...source }).ok).toBe(
      false
    );
  });

  it("rejects fractional pixel dimensions", () => {
    const result = resolveTargetSize({ mode: "dimensions", width: "1.5", height: "2", ...source });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/whole numbers/);
  });

  it("rejects zero and negative sizes", () => {
    expect(resolveTargetSize({ mode: "dimensions", width: "0", height: "10", ...source }).ok).toBe(
      false
    );
    expect(resolveTargetSize({ mode: "percentage", percentage: 0, ...source }).ok).toBe(false);
  });

  it("rejects a resize before an image is loaded", () => {
    const result = resolveTargetSize({
      mode: "dimensions",
      width: "10",
      height: "10",
      originalWidth: 0,
      originalHeight: 0,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Load an image/);
  });

  // Surfaced so the UI can warn — enlarging invents detail that was never
  // captured, and users routinely expect the opposite.
  it("flags an upscale in both modes", () => {
    expect(
      resolveTargetSize({ mode: "dimensions", width: "2000", height: "1000", ...source }).isUpscale
    ).toBe(true);
    expect(resolveTargetSize({ mode: "percentage", percentage: 150, ...source }).isUpscale).toBe(
      true
    );
  });
});

describe("linkedDimension", () => {
  it("scales the partner dimension proportionally", () => {
    expect(linkedDimension("500", 1000, 500)).toBe("250");
  });

  // The bug: mirroring a blank entry drove the other field to 0, leaving both
  // boxes reading 0 and no way back except reloading.
  it("leaves the partner alone for a blank entry", () => {
    expect(linkedDimension("", 1000, 500)).toBe(null);
    expect(linkedDimension("   ", 1000, 500)).toBe(null);
  });

  it("leaves the partner alone for invalid or non-positive input", () => {
    expect(linkedDimension("abc", 1000, 500)).toBe(null);
    expect(linkedDimension("0", 1000, 500)).toBe(null);
    expect(linkedDimension("-5", 1000, 500)).toBe(null);
  });

  it("never produces a zero dimension when rounding down", () => {
    expect(linkedDimension("1", 1000, 5)).toBe("1");
  });

  it("returns null without a source ratio", () => {
    expect(linkedDimension("500", 0, 500)).toBe(null);
  });
});

describe("clampQuality", () => {
  it("passes a valid quality through", () => {
    expect(clampQuality(0.8)).toBe(0.8);
  });

  // Some browsers treat an out-of-range quality as a reason to abandon the
  // requested format entirely and fall back to PNG.
  it("clamps out-of-range values into the encoder's accepted band", () => {
    expect(clampQuality(5)).toBe(1);
    expect(clampQuality(-1)).toBe(0.05);
  });

  it("falls back to a sensible default for nonsense", () => {
    expect(clampQuality("abc")).toBe(0.85);
    expect(clampQuality(undefined)).toBe(0.85);
  });
});

describe("encoderFor", () => {
  it("carries quality for lossy formats", () => {
    expect(encoderFor("image/jpeg", 0.7)).toEqual({ mimeType: "image/jpeg", quality: 0.7 });
  });

  it("omits quality for PNG, which has no such parameter", () => {
    expect(encoderFor("image/png", 0.7)).toEqual({ mimeType: "image/png", quality: undefined });
  });
});

describe("needsMatte", () => {
  // Without a matte, transparent pixels encode as black in JPG, which reads
  // as a corrupted image rather than a format limitation.
  it("is true only for JPG", () => {
    expect(needsMatte("image/jpeg")).toBe(true);
    expect(needsMatte("image/png")).toBe(false);
    expect(needsMatte("image/webp")).toBe(false);
    expect(needsMatte("image/avif")).toBe(false);
  });
});

describe("extensionFor", () => {
  it("maps each supported mime type", () => {
    expect(extensionFor("image/jpeg")).toBe("jpg");
    expect(extensionFor("image/png")).toBe("png");
    expect(extensionFor("image/webp")).toBe("webp");
    expect(extensionFor("image/avif")).toBe("avif");
  });

  it("falls back to jpg for anything unknown", () => {
    expect(extensionFor("image/tiff")).toBe("jpg");
  });
});

describe("outputFilename", () => {
  // Twenty files all called "converted.jpg" is useless in a batch.
  it("keeps the original stem and swaps the extension", () => {
    expect(outputFilename("holiday-photo.png", "image/jpeg")).toBe("holiday-photo.jpg");
  });

  it("appends a suffix when given one", () => {
    expect(outputFilename("photo.jpg", "image/webp", "-resized")).toBe("photo-resized.webp");
  });

  it("handles a name with several dots", () => {
    expect(outputFilename("my.holiday.photo.png", "image/jpeg")).toBe("my.holiday.photo.jpg");
  });

  it("handles a name with no extension", () => {
    expect(outputFilename("photo", "image/png")).toBe("photo.png");
  });

  it("falls back to a usable name for empty input", () => {
    expect(outputFilename("", "image/png")).toBe("image.png");
    expect(outputFilename(null, "image/png")).toBe("image.png");
  });
});
