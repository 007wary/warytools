import { describe, it, expect } from "vitest";
import {
  ASPECT_RATIOS,
  FULL_RECT,
  resolveAspect,
  normalizeRect,
  applyAspect,
  translateRect,
  toSourceRect,
  toPdfBox,
  describeCrop,
  nudgeRect,
} from "./cropGeometry";

const A4 = { width: 595.28, height: 841.89 };

describe("resolveAspect", () => {
  it("returns null for freeform", () => {
    expect(resolveAspect("free", 100, 100)).toBe(null);
  });

  it("resolves numeric presets", () => {
    expect(resolveAspect("1:1", 100, 200)).toBe(1);
    expect(resolveAspect("16:9", 100, 200)).toBeCloseTo(16 / 9, 6);
  });

  it("resolves 'original' against the source, not a fixed number", () => {
    // A mixed-size document has no single original ratio, which is the whole
    // reason this is resolved per-page rather than baked into the preset.
    expect(resolveAspect("original", 800, 400)).toBe(2);
    expect(resolveAspect("original", 400, 800)).toBe(0.5);
  });

  it("falls back to freeform when the source is unknown", () => {
    expect(resolveAspect("original", 0, 0)).toBe(null);
    expect(resolveAspect("nonsense", 100, 100)).toBe(null);
  });
});

describe("normalizeRect", () => {
  it("leaves a valid rectangle alone", () => {
    const rect = { x: 0.1, y: 0.2, width: 0.5, height: 0.6 };
    expect(normalizeRect(rect)).toEqual(rect);
  });

  it("flips a backwards drag into a forwards rectangle", () => {
    // Dragging up and left produces negative dimensions. pdf-lib would write
    // an inverted CropBox that readers show as an empty page.
    const flipped = normalizeRect({ x: 0.8, y: 0.9, width: -0.3, height: -0.4 });

    expect(flipped.x).toBeCloseTo(0.5, 6);
    expect(flipped.y).toBeCloseTo(0.5, 6);
    expect(flipped.width).toBeCloseTo(0.3, 6);
    expect(flipped.height).toBeCloseTo(0.4, 6);
  });

  it("clamps a rectangle dragged past the surface edge", () => {
    const clamped = normalizeRect({ x: 0.8, y: 0.8, width: 0.5, height: 0.5 });

    expect(clamped.x + clamped.width).toBeLessThanOrEqual(1.000001);
    expect(clamped.y + clamped.height).toBeLessThanOrEqual(1.000001);
  });

  it("never returns a degenerate rectangle", () => {
    const tiny = normalizeRect({ x: 0.5, y: 0.5, width: 0, height: 0 });
    expect(tiny.width).toBeGreaterThan(0);
    expect(tiny.height).toBeGreaterThan(0);
  });

  it("keeps the minimum size even at the far edge", () => {
    // Clamping width against `1 - x` alone still yields a sub-minimum box when
    // x is nearly 1; the origin has to be pulled back instead.
    const edge = normalizeRect({ x: 0.999, y: 0.999, width: 0.5, height: 0.5 });

    expect(edge.width).toBeGreaterThanOrEqual(0.02);
    expect(edge.height).toBeGreaterThanOrEqual(0.02);
    expect(edge.x + edge.width).toBeLessThanOrEqual(1.000001);
    expect(edge.y + edge.height).toBeLessThanOrEqual(1.000001);
  });

  it("falls back to the full surface on garbage input", () => {
    expect(normalizeRect(null)).toEqual(FULL_RECT);
    expect(normalizeRect({ x: NaN, y: 0, width: 1, height: 1 })).toEqual(FULL_RECT);
    expect(normalizeRect({ x: 0, y: 0, width: Infinity, height: 1 })).toEqual(FULL_RECT);
  });
});

describe("applyAspect", () => {
  it("returns a freeform rectangle unchanged", () => {
    const rect = { x: 0.1, y: 0.1, width: 0.5, height: 0.3 };
    expect(applyAspect(rect, null, A4.width, A4.height, { x: 0.1, y: 0.1 })).toEqual(rect);
  });

  it("produces a true square on a non-square page", () => {
    // The bug this pins: a 1:1 ratio is NOT 1 in normalised coordinates on an
    // A4 page. Using the raw ratio makes "square" crops come out rectangular.
    const rect = applyAspect(
      { x: 0, y: 0, width: 0.5, height: 0.1 },
      1,
      A4.width,
      A4.height,
      { x: 0, y: 0 }
    );

    const source = toSourceRect(rect, A4.width, A4.height);
    expect(source.width / source.height).toBeCloseTo(1, 3);
  });

  it("produces a true 16:9 crop in source units", () => {
    const rect = applyAspect(
      { x: 0, y: 0, width: 0.8, height: 0.2 },
      16 / 9,
      A4.width,
      A4.height,
      { x: 0, y: 0 }
    );

    const source = toSourceRect(rect, A4.width, A4.height);
    expect(source.width / source.height).toBeCloseTo(16 / 9, 2);
  });

  it("keeps the anchored corner fixed when growing right and down", () => {
    const anchor = { x: 0.2, y: 0.2 };
    const rect = applyAspect(
      { x: 0.2, y: 0.2, width: 0.4, height: 0.1 },
      1,
      A4.width,
      A4.height,
      anchor
    );

    expect(rect.x).toBeCloseTo(anchor.x, 6);
    expect(rect.y).toBeCloseTo(anchor.y, 6);
  });

  it("keeps the anchored corner fixed when growing left and up", () => {
    // Resizing from the top-left with the bottom-right pinned is the standard
    // behaviour in every image editor; without it the box slides around.
    const anchor = { x: 0.8, y: 0.8 };
    const rect = applyAspect(
      { x: 0.3, y: 0.5, width: 0.5, height: 0.3 },
      1,
      A4.width,
      A4.height,
      anchor
    );

    expect(rect.x + rect.width).toBeCloseTo(anchor.x, 6);
    expect(rect.y + rect.height).toBeCloseTo(anchor.y, 6);
  });

  it("stays inside the surface when dragged into a corner", () => {
    // Capping one axis without recomputing the other would silently break the
    // aspect constraint the user asked for.
    const rect = applyAspect(
      { x: 0.9, y: 0.9, width: 0.5, height: 0.5 },
      16 / 9,
      A4.width,
      A4.height,
      { x: 0.9, y: 0.9 }
    );

    expect(rect.x + rect.width).toBeLessThanOrEqual(1.000001);
    expect(rect.y + rect.height).toBeLessThanOrEqual(1.000001);
  });

  it("holds the ratio across every preset", () => {
    for (const preset of ASPECT_RATIOS) {
      const aspect = resolveAspect(preset.id, A4.width, A4.height);
      if (aspect === null) continue;

      const rect = applyAspect(
        { x: 0.1, y: 0.1, width: 0.4, height: 0.2 },
        aspect,
        A4.width,
        A4.height,
        { x: 0.1, y: 0.1 }
      );

      const source = toSourceRect(rect, A4.width, A4.height);
      expect(source.width / source.height, preset.id).toBeCloseTo(aspect, 2);
    }
  });
});

describe("translateRect", () => {
  it("moves a rectangle by the delta", () => {
    const moved = translateRect({ x: 0.2, y: 0.2, width: 0.3, height: 0.3 }, 0.1, -0.1);
    expect(moved.x).toBeCloseTo(0.3, 6);
    expect(moved.y).toBeCloseTo(0.1, 6);
  });

  it("slides flush to the edge without shrinking", () => {
    // A crop that quietly resized itself while being moved would lose the
    // framing the user set.
    const moved = translateRect({ x: 0.8, y: 0.8, width: 0.2, height: 0.2 }, 0.5, 0.5);

    expect(moved.width).toBeCloseTo(0.2, 6);
    expect(moved.height).toBeCloseTo(0.2, 6);
    expect(moved.x).toBeCloseTo(0.8, 6);
  });

  it("stops at the near edge too", () => {
    const moved = translateRect({ x: 0.1, y: 0.1, width: 0.2, height: 0.2 }, -0.5, -0.5);
    expect(moved.x).toBe(0);
    expect(moved.y).toBe(0);
    expect(moved.width).toBeCloseTo(0.2, 6);
  });
});

describe("toSourceRect", () => {
  it("scales a normalised rectangle into source units", () => {
    const source = toSourceRect({ x: 0.5, y: 0.25, width: 0.5, height: 0.5 }, 800, 400);
    expect(source).toEqual({ x: 400, y: 100, width: 400, height: 200 });
  });
});

describe("toPdfBox", () => {
  const mediaBox = { x: 0, y: 0, width: 600, height: 800 };

  it("flips the y axis from screen to PDF coordinates", () => {
    // The single most likely bug in the crop tool: PDF's origin is bottom-left
    // with y increasing upward, every screen system is the opposite. Getting
    // it wrong crops the mirror image of the selection, silently.
    const box = toPdfBox({ x: 0, y: 0, width: 1, height: 0.25 }, mediaBox);

    // Top quarter on screen = the TOP of the page in PDF space, which is the
    // high-y end: 800 - 200 = 600.
    expect(box.y).toBeCloseTo(600, 6);
    expect(box.height).toBeCloseTo(200, 6);
  });

  it("puts a bottom-anchored crop at y=0", () => {
    const box = toPdfBox({ x: 0, y: 0.75, width: 1, height: 0.25 }, mediaBox);
    expect(box.y).toBeCloseTo(0, 6);
  });

  it("leaves a full-page crop as the whole media box", () => {
    const box = toPdfBox(FULL_RECT, mediaBox);
    expect(box).toEqual({ x: 0, y: 0, width: 600, height: 800 });
  });

  it("respects a non-zero media box origin", () => {
    // A page cropped once already has one; ignoring it shifts the second crop
    // off the page entirely.
    const offset = { x: 20, y: 30, width: 600, height: 800 };
    const box = toPdfBox({ x: 0, y: 0, width: 0.5, height: 0.5 }, offset);

    expect(box.x).toBeCloseTo(20, 6);
    expect(box.y).toBeCloseTo(30 + 400, 6);
  });

  it("survives a missing media box", () => {
    const box = toPdfBox(FULL_RECT, null);
    expect(Number.isFinite(box.x)).toBe(true);
    expect(Number.isFinite(box.y)).toBe(true);
  });

  // A page with /Rotate is displayed turned, so the user's rectangle is in a
  // frame the MediaBox doesn't share. Ignoring the angle crops a region rotated
  // away from the selection — and every number involved stays valid, so there
  // is nothing to notice until the output is opened.
  describe("page rotation", () => {
    it("leaves an unrotated page unchanged", () => {
      const box = toPdfBox({ x: 0, y: 0, width: 1, height: 0.25 }, mediaBox, 0);
      expect(box.y).toBeCloseTo(600, 6);
      expect(box.height).toBeCloseTo(200, 6);
    });

    it("swaps the axes at 90 degrees", () => {
      // Displayed page is 800 wide x 600 tall; the top quarter of the DISPLAY
      // is a strip down one side of the unrotated page.
      const box = toPdfBox({ x: 0, y: 0, width: 1, height: 0.25 }, mediaBox, 90);

      // A displayed height becomes an unrotated width.
      expect(box.width).toBeCloseTo(600 * 0.25, 6);
      expect(box.height).toBeCloseTo(800, 6);
    });

    it("swaps the axes at 270 degrees", () => {
      const box = toPdfBox({ x: 0, y: 0, width: 1, height: 0.25 }, mediaBox, 270);
      expect(box.width).toBeCloseTo(600 * 0.25, 6);
      expect(box.height).toBeCloseTo(800, 6);
    });

    it("mirrors both axes at 180 degrees", () => {
      // The top of the display is the bottom of the unrotated page, so the
      // box lands at y=0 rather than y=600.
      const box = toPdfBox({ x: 0, y: 0, width: 1, height: 0.25 }, mediaBox, 180);
      expect(box.y).toBeCloseTo(0, 6);
      expect(box.height).toBeCloseTo(200, 6);
    });

    it("puts 90 and 270 on opposite sides of the page", () => {
      const at90 = toPdfBox({ x: 0, y: 0, width: 1, height: 0.25 }, mediaBox, 90);
      const at270 = toPdfBox({ x: 0, y: 0, width: 1, height: 0.25 }, mediaBox, 270);
      expect(at90.x).not.toBeCloseTo(at270.x, 3);
    });

    it("keeps every rotation inside the media box", () => {
      for (const angle of [0, 90, 180, 270]) {
        const box = toPdfBox({ x: 0.1, y: 0.2, width: 0.5, height: 0.3 }, mediaBox, angle);

        expect(box.x, `angle ${angle}`).toBeGreaterThanOrEqual(-0.001);
        expect(box.y, `angle ${angle}`).toBeGreaterThanOrEqual(-0.001);
        expect(box.x + box.width, `angle ${angle}`).toBeLessThanOrEqual(600.001);
        expect(box.y + box.height, `angle ${angle}`).toBeLessThanOrEqual(800.001);
      }
    });

    it("leaves a full-page crop as the whole media box at any rotation", () => {
      // The invariant that catches a sign error anywhere in the mapping.
      for (const angle of [0, 90, 180, 270]) {
        const box = toPdfBox(FULL_RECT, mediaBox, angle);
        expect(box.width, `angle ${angle}`).toBeCloseTo(600, 6);
        expect(box.height, `angle ${angle}`).toBeCloseTo(800, 6);
        expect(box.x, `angle ${angle}`).toBeCloseTo(0, 6);
        expect(box.y, `angle ${angle}`).toBeCloseTo(0, 6);
      }
    });

    it("normalises negative and over-360 angles, which real files carry", () => {
      const reference = toPdfBox({ x: 0.1, y: 0.2, width: 0.4, height: 0.3 }, mediaBox, 90);

      for (const equivalent of [-270, 450, 810]) {
        const box = toPdfBox({ x: 0.1, y: 0.2, width: 0.4, height: 0.3 }, mediaBox, equivalent);
        expect(box.x, `angle ${equivalent}`).toBeCloseTo(reference.x, 6);
        expect(box.y, `angle ${equivalent}`).toBeCloseTo(reference.y, 6);
      }
    });

    it("treats a missing rotation as zero", () => {
      const box = toPdfBox({ x: 0, y: 0, width: 1, height: 0.25 }, mediaBox);
      expect(box.y).toBeCloseTo(600, 6);
    });
  });
});

describe("describeCrop", () => {
  it("reports points, millimetres, and the page fraction", () => {
    const text = describeCrop(FULL_RECT, A4.width, A4.height);
    expect(text).toContain("595 × 842 pt");
    // A4 is 210 x 297 mm — the figure people recognise.
    expect(text).toContain("210 × 297 mm");
    expect(text).toContain("100% of the page");
  });

  it("returns an empty string with no source dimensions", () => {
    expect(describeCrop(FULL_RECT, 0, 0)).toBe("");
  });
});

describe("nudgeRect", () => {
  it("moves by a fine step", () => {
    const moved = nudgeRect({ x: 0.5, y: 0.5, width: 0.2, height: 0.2 }, "ArrowRight");
    expect(moved.x).toBeCloseTo(0.51, 6);
  });

  it("moves by a coarse step with shift", () => {
    const moved = nudgeRect({ x: 0.5, y: 0.5, width: 0.2, height: 0.2 }, "ArrowRight", {
      coarse: true,
    });
    expect(moved.x).toBeCloseTo(0.55, 6);
  });

  it("resizes rather than moves when asked", () => {
    const resized = nudgeRect({ x: 0.1, y: 0.1, width: 0.2, height: 0.2 }, "ArrowRight", {
      resize: true,
    });
    expect(resized.width).toBeCloseTo(0.21, 6);
    expect(resized.x).toBeCloseTo(0.1, 6);
  });

  it("ignores non-arrow keys", () => {
    const rect = { x: 0.1, y: 0.1, width: 0.2, height: 0.2 };
    expect(nudgeRect(rect, "Enter")).toEqual(rect);
  });

  it("stays inside the surface", () => {
    let rect = { x: 0.9, y: 0.9, width: 0.1, height: 0.1 };
    for (let i = 0; i < 20; i++) rect = nudgeRect(rect, "ArrowRight", { coarse: true });

    expect(rect.x + rect.width).toBeLessThanOrEqual(1.000001);
  });
});
