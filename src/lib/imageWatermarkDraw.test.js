import { describe, it, expect } from "vitest";
import { drawWatermark } from "./imageWatermarkDraw";
import { DEFAULT_SETTINGS, findColor, findOpacity, resolveFontSize } from "./imageWatermark";

// A recording 2D context.
//
// The drawing routine is nothing but calls against this API, so a stub that
// records them verifies the parts a geometry test cannot reach: the ORDER of
// operations. Every ordering rule in that file fails silently when broken —
// stroke after fill gives thin letters, rotate before translate swings marks
// off their anchor along an arc, measuring before setting the font returns a
// width in the default 10px font. All three produce a plausible image and no
// error, which is precisely the class of bug this repo keeps being bitten by.
function recordingContext({ textWidth = 200 } = {}) {
  const calls = [];
  const state = {};

  const record = (name) => (...args) => {
    calls.push({ name, args });
  };

  const ctx = {
    calls,
    // measureText reports against whatever font is currently set, which is the
    // behaviour that makes the set-font-then-measure order load-bearing. The
    // stub reproduces it: measuring with no font set returns a different number.
    measureText(text) {
      calls.push({ name: "measureText", args: [text], font: ctx.font });
      return { width: ctx.font ? textWidth : 10 };
    },
    save: record("save"),
    restore: record("restore"),
    translate: record("translate"),
    rotate: record("rotate"),
    strokeText: record("strokeText"),
    fillText: record("fillText"),
    drawImage: record("drawImage"),
  };

  // Property assignments are recorded too, in sequence with the calls, so the
  // "font set before measureText" relationship is visible in one timeline.
  for (const property of [
    "font",
    "fillStyle",
    "strokeStyle",
    "lineWidth",
    "lineJoin",
    "miterLimit",
    "textAlign",
    "textBaseline",
    "globalAlpha",
  ]) {
    Object.defineProperty(ctx, property, {
      get: () => state[property],
      set: (value) => {
        state[property] = value;
        calls.push({ name: `set:${property}`, args: [value] });
      },
    });
  }

  return ctx;
}

const names = (ctx) => ctx.calls.map((call) => call.name);
const only = (ctx, name) => ctx.calls.filter((call) => call.name === name);
const firstIndex = (ctx, name) => names(ctx).indexOf(name);

const TEXT = { ...DEFAULT_SETTINGS, text: "© Test" };
const LOGO = { width: 400, height: 200 };

describe("drawWatermark — text", () => {
  it("draws one mark for the single layout", () => {
    const ctx = recordingContext();
    const drawn = drawWatermark(ctx, 1600, 900, TEXT);

    expect(drawn).toBe(1);
    expect(only(ctx, "fillText")).toHaveLength(1);
    expect(only(ctx, "strokeText")).toHaveLength(1);
    expect(only(ctx, "fillText")[0].args[0]).toBe("© Test");
  });

  // The ordering rule that keeps text legible. The stroke is centred on the
  // glyph outline, so filling first and stroking over it eats half the stroke
  // width into the letterforms — thinning the text at exactly the large sizes
  // where the outline was supposed to help.
  it("strokes the outline BEFORE filling, so the fill sits on top", () => {
    const ctx = recordingContext();
    drawWatermark(ctx, 1600, 900, TEXT);

    expect(firstIndex(ctx, "strokeText")).toBeLessThan(firstIndex(ctx, "fillText"));
  });

  // measureText reports against the CURRENT font. Measuring first returns the
  // width in the browser default (10px sans-serif), which is roughly a fifth of
  // the real width — so every inset and every tile step derived from it is
  // wrong, with no error anywhere.
  it("sets the font BEFORE measuring the text", () => {
    const ctx = recordingContext({ textWidth: 200 });
    drawWatermark(ctx, 1600, 900, TEXT);

    const measure = ctx.calls.find((call) => call.name === "measureText");
    expect(measure.font).toBeTruthy();
    expect(measure.font).toContain("px");
    expect(firstIndex(ctx, "set:font")).toBeLessThan(firstIndex(ctx, "measureText"));
  });

  // translate-then-rotate turns the mark about its own centre. The reverse
  // rotates the whole coordinate system first, so the translation is applied
  // along the rotated axes and every mark swings away from its anchor on an
  // arc — worse the further the mark is from the origin, which means a corner
  // credit ends up off the image entirely.
  it("translates BEFORE rotating, so marks turn about their own centre", () => {
    const ctx = recordingContext();
    drawWatermark(ctx, 1600, 900, { ...TEXT, rotationId: "diagonal" });

    expect(firstIndex(ctx, "translate")).toBeLessThan(firstIndex(ctx, "rotate"));
  });

  // Without textBaseline "middle" the glyphs sit above the anchor by most of
  // their height, and a bottom-edge credit lands partly off the image.
  it("centres the text on its anchor point in both axes", () => {
    const ctx = recordingContext();
    drawWatermark(ctx, 1600, 900, TEXT);

    expect(only(ctx, "set:textAlign")[0].args[0]).toBe("center");
    expect(only(ctx, "set:textBaseline")[0].args[0]).toBe("middle");
    // Drawn at the translated origin, never at an offset — the translate IS the
    // placement, and a non-zero offset here would double-apply it.
    expect(only(ctx, "fillText")[0].args.slice(1)).toEqual([0, 0]);
    expect(only(ctx, "strokeText")[0].args.slice(1)).toEqual([0, 0]);
  });

  it("applies the chosen colour, outline, and opacity", () => {
    const ctx = recordingContext();
    drawWatermark(ctx, 1600, 900, { ...TEXT, colorId: "red", opacityId: "strong" });

    const red = findColor("red");
    expect(only(ctx, "set:fillStyle")[0].args[0]).toBe(red.hex);
    expect(only(ctx, "set:strokeStyle")[0].args[0]).toBe(red.outline);
    expect(only(ctx, "set:globalAlpha")[0].args[0]).toBe(findOpacity("strong").value);
  });

  // Round joins stop the stroke spiking off sharp glyph corners — visible barbs
  // on A, W, and M at large sizes.
  it("uses round joins so the outline doesn't spike off glyph corners", () => {
    const ctx = recordingContext();
    drawWatermark(ctx, 1600, 900, TEXT);
    expect(only(ctx, "set:lineJoin")[0].args[0]).toBe("round");
  });

  it("scales the outline with the font size", () => {
    const small = recordingContext();
    drawWatermark(small, 400, 400, { ...TEXT, textSizeId: "small" });
    const large = recordingContext();
    drawWatermark(large, 4000, 4000, { ...TEXT, textSizeId: "huge" });

    expect(only(large, "set:lineWidth")[0].args[0]).toBeGreaterThan(
      only(small, "set:lineWidth")[0].args[0]
    );
  });

  it("draws a mark per tile in the tiled layout", () => {
    const ctx = recordingContext();
    const drawn = drawWatermark(ctx, 1600, 900, { ...TEXT, layoutId: "tile" });

    expect(drawn).toBeGreaterThan(1);
    expect(only(ctx, "fillText")).toHaveLength(drawn);
    expect(only(ctx, "strokeText")).toHaveLength(drawn);
  });

  // Every per-mark save must have its restore, plus the one wrapping the whole
  // routine. An unbalanced stack leaks globalAlpha and the rotation onto
  // whatever the caller draws next — which, in the worker, is the next image.
  it("balances every save with a restore", () => {
    const ctx = recordingContext();
    const drawn = drawWatermark(ctx, 1600, 900, { ...TEXT, layoutId: "tile" });

    expect(only(ctx, "save")).toHaveLength(drawn + 1);
    expect(only(ctx, "restore")).toHaveLength(drawn + 1);
    expect(names(ctx)[names(ctx).length - 1]).toBe("restore");

    // Depth never goes negative and returns to exactly zero.
    let depth = 0;
    for (const name of names(ctx)) {
      if (name === "save") depth++;
      if (name === "restore") depth--;
      expect(depth).toBeGreaterThanOrEqual(0);
    }
    expect(depth).toBe(0);
  });

  it("rotates by the preset's angle, in radians", () => {
    const ctx = recordingContext();
    drawWatermark(ctx, 1600, 900, { ...TEXT, rotationId: "diagonal" });
    expect(only(ctx, "rotate")[0].args[0]).toBeCloseTo((-45 * Math.PI) / 180);
  });

  // Sizes are proportional, so the same settings across a mixed batch must
  // produce a proportionally identical mark rather than a fixed pixel one.
  it("sizes the mark against the output dimensions it is given", () => {
    const small = recordingContext();
    drawWatermark(small, 500, 500, TEXT);
    const large = recordingContext();
    drawWatermark(large, 5000, 5000, TEXT);

    const sizeOf = (ctx) => Number(only(ctx, "set:font")[0].args[0].match(/(\d+)px/)[1]);
    expect(sizeOf(large) / sizeOf(small)).toBeCloseTo(10, 0);
    expect(sizeOf(small)).toBeCloseTo(resolveFontSize("medium", 500, 500), 0);
  });
});

describe("drawWatermark — logo", () => {
  it("draws the logo centred on its anchor", () => {
    const ctx = recordingContext();
    const drawn = drawWatermark(ctx, 1600, 900, { ...TEXT, mode: "image" }, LOGO);

    expect(drawn).toBe(1);
    const [image, x, y, w, h] = only(ctx, "drawImage")[0].args;
    expect(image).toBe(LOGO);
    // Drawn from the negative half-extent, matching the text path's centring.
    expect(x).toBeCloseTo(-w / 2);
    expect(y).toBeCloseTo(-h / 2);
    // Aspect ratio preserved: the source is 2:1.
    expect(w / h).toBeCloseTo(2);
  });

  it("never strokes or fills text in logo mode", () => {
    const ctx = recordingContext();
    drawWatermark(ctx, 1600, 900, { ...TEXT, mode: "image" }, LOGO);

    expect(only(ctx, "fillText")).toHaveLength(0);
    expect(only(ctx, "strokeText")).toHaveLength(0);
  });

  it("tiles the logo too", () => {
    const ctx = recordingContext();
    const drawn = drawWatermark(
      ctx,
      1600,
      900,
      { ...TEXT, mode: "image", layoutId: "tile" },
      LOGO
    );
    expect(drawn).toBeGreaterThan(1);
    expect(only(ctx, "drawImage")).toHaveLength(drawn);
  });
});

describe("drawWatermark — nothing to draw", () => {
  // Each of these must leave the canvas completely untouched. A stray save
  // without its restore, or a globalAlpha set on the way to an early return,
  // would leak onto the image the caller draws next.
  it("draws nothing and touches nothing when there is no text", () => {
    const ctx = recordingContext();
    expect(drawWatermark(ctx, 1600, 900, { ...TEXT, text: "" })).toBe(0);
    expect(ctx.calls).toEqual([]);
  });

  it("draws nothing when logo mode has no logo", () => {
    const ctx = recordingContext();
    expect(drawWatermark(ctx, 1600, 900, { ...TEXT, mode: "image" }, null)).toBe(0);
    expect(ctx.calls).toEqual([]);
  });

  it("draws nothing on a zero-sized canvas", () => {
    const ctx = recordingContext();
    expect(drawWatermark(ctx, 0, 0, TEXT)).toBe(0);
    expect(only(ctx, "fillText")).toHaveLength(0);
  });

  it("draws nothing for a logo with no dimensions", () => {
    const ctx = recordingContext();
    expect(
      drawWatermark(ctx, 1600, 900, { ...TEXT, mode: "image" }, { width: 0, height: 0 })
    ).toBe(0);
    expect(only(ctx, "drawImage")).toHaveLength(0);
  });

  it("survives missing settings rather than throwing mid-batch", () => {
    const ctx = recordingContext();
    expect(drawWatermark(ctx, 1600, 900, null)).toBe(0);
    expect(drawWatermark(null, 1600, 900, TEXT)).toBe(0);
  });
});
