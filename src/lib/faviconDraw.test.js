import { describe, it, expect } from "vitest";
import { drawIcon } from "./faviconDraw";

// A recording 2D context, same approach as imageWatermarkDraw.test.js.
//
// The ordering rules in faviconDraw.js all fail silently: a clip applied after
// drawImage affects nothing (square corners on a rounded icon), a font set
// after fillText draws at the default 10px, and an unbalanced save/restore
// leaks the clip onto whatever is drawn next. None of them throw, and all of
// them produce an image that looks broadly right at a glance.
function recordingContext() {
  const calls = [];
  const state = {};

  const record = (name) => (...args) => {
    calls.push({ name, args, font: state.font });
  };

  const ctx = {
    calls,
    save: record("save"),
    restore: record("restore"),
    clearRect: record("clearRect"),
    fillRect: record("fillRect"),
    fill: record("fill"),
    clip: record("clip"),
    beginPath: record("beginPath"),
    closePath: record("closePath"),
    moveTo: record("moveTo"),
    lineTo: record("lineTo"),
    arcTo: record("arcTo"),
    drawImage: record("drawImage"),
    fillText: record("fillText"),
  };

  for (const property of [
    "font",
    "fillStyle",
    "textAlign",
    "textBaseline",
    "imageSmoothingEnabled",
    "imageSmoothingQuality",
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

const SOURCE = { width: 400, height: 200 };

describe("drawIcon — surface hygiene", () => {
  // The preview canvas is reused across every settings change. Without a clear
  // at the top, switching from an opaque background to a transparent one leaves
  // the old colour showing — visible only on transparent output, which is
  // exactly where nobody looks.
  it("clears the surface before drawing anything", () => {
    const ctx = recordingContext();
    drawIcon(ctx, 64, { mode: "image", background: "#ff0000" }, SOURCE);

    expect(names(ctx)[0]).toBe("clearRect");
    expect(only(ctx, "clearRect")[0].args).toEqual([0, 0, 64, 64]);
  });

  it("balances every save with a restore", () => {
    const cases = [
      [{ mode: "image", background: "#ffffff", roundness: 0.25 }, SOURCE],
      [{ mode: "image", background: "transparent", roundness: 0 }, SOURCE],
      [{ mode: "text", background: "#0000ff", text: "A", roundness: 0.5 }, null],
    ];

    cases.forEach(([settings, source]) => {
      const ctx = recordingContext();
      drawIcon(ctx, 64, settings, source);

      expect(only(ctx, "save").length).toBe(only(ctx, "restore").length);

      // Not merely equal counts — the sequence must never go negative, or a
      // restore is unwinding state the caller owns.
      let depth = 0;
      names(ctx).forEach((name) => {
        if (name === "save") depth += 1;
        if (name === "restore") depth -= 1;
        expect(depth).toBeGreaterThanOrEqual(0);
      });
      expect(depth).toBe(0);
    });
  });
});

describe("drawIcon — background", () => {
  it("fills a square background with fillRect when there is no roundness", () => {
    const ctx = recordingContext();
    drawIcon(ctx, 64, { mode: "image", background: "#ff0000", roundness: 0 }, SOURCE);

    expect(only(ctx, "fillRect")[0].args).toEqual([0, 0, 64, 64]);
    expect(only(ctx, "fill")).toHaveLength(0);
  });

  it("fills a traced path when the icon is rounded", () => {
    const ctx = recordingContext();
    drawIcon(ctx, 64, { mode: "image", background: "#ff0000", roundness: 0.25 }, SOURCE);

    expect(only(ctx, "fill")).toHaveLength(1);
    expect(only(ctx, "fillRect")).toHaveLength(0);
    expect(firstIndex(ctx, "beginPath")).toBeLessThan(firstIndex(ctx, "fill"));
  });

  it("draws no background at all when transparent", () => {
    const ctx = recordingContext();
    drawIcon(ctx, 64, { mode: "image", background: "transparent" }, SOURCE);

    expect(only(ctx, "fillRect")).toHaveLength(0);
    expect(only(ctx, "fill")).toHaveLength(0);
    expect(only(ctx, "drawImage")).toHaveLength(1);
  });
});

describe("drawIcon — image mode", () => {
  it("draws the source at the fitted rect", () => {
    const ctx = recordingContext();
    drawIcon(ctx, 64, { mode: "image", fit: "contain", padding: 0 }, SOURCE);

    const [source, x, y, width, height] = only(ctx, "drawImage")[0].args;
    expect(source).toBe(SOURCE);
    // 400x200 contained in 64 => 64x32, centred vertically.
    expect([x, y, width, height]).toEqual([0, 16, 64, 32]);
  });

  // The ordering rule this file exists to protect. A clip issued after
  // drawImage restricts nothing, so a rounded icon keeps square corners on its
  // artwork while the background behind it is correctly rounded — subtle, and
  // no error anywhere.
  it("clips BEFORE drawing the image, not after", () => {
    const ctx = recordingContext();
    drawIcon(ctx, 64, { mode: "image", roundness: 0.3, background: "#fff" }, SOURCE);

    const clipAt = firstIndex(ctx, "clip");
    const drawAt = firstIndex(ctx, "drawImage");

    expect(clipAt).toBeGreaterThan(-1);
    expect(clipAt).toBeLessThan(drawAt);
  });

  it("does not clip a square icon, since there is nothing to crop to", () => {
    const ctx = recordingContext();
    drawIcon(ctx, 64, { mode: "image", roundness: 0 }, SOURCE);

    expect(only(ctx, "clip")).toHaveLength(0);
  });

  it("enables high-quality smoothing before the draw", () => {
    const ctx = recordingContext();
    drawIcon(ctx, 64, { mode: "image" }, SOURCE);

    expect(firstIndex(ctx, "set:imageSmoothingQuality")).toBeLessThan(
      firstIndex(ctx, "drawImage")
    );
    expect(only(ctx, "set:imageSmoothingQuality")[0].args[0]).toBe("high");
  });

  it("draws nothing when there is no source, without throwing", () => {
    const ctx = recordingContext();
    expect(() => drawIcon(ctx, 64, { mode: "image" }, null)).not.toThrow();
    expect(only(ctx, "drawImage")).toHaveLength(0);
  });

  // drawImage with a non-finite rect throws, which in a batch would take down
  // every other size over one unreadable file.
  it("skips a degenerate source rather than calling drawImage with Infinity", () => {
    const ctx = recordingContext();
    drawIcon(ctx, 64, { mode: "image" }, { width: 0, height: 100 });

    expect(only(ctx, "drawImage")).toHaveLength(0);
  });
});

describe("drawIcon — text mode", () => {
  it("draws the text centred, and never touches the image path", () => {
    const ctx = recordingContext();
    drawIcon(ctx, 64, { mode: "text", text: "A", background: "#ffffff" });

    const call = only(ctx, "fillText")[0];
    expect(call.args[0]).toBe("A");
    expect(call.args[1]).toBe(32);
    expect(only(ctx, "drawImage")).toHaveLength(0);
  });

  // measureText isn't used here, but the same trap applies to fillText: the
  // glyph rasterises in whatever font is current, so setting it afterwards
  // draws at the default 10px sans-serif. The font must precede the draw.
  it("sets the font before drawing the glyph", () => {
    const ctx = recordingContext();
    drawIcon(ctx, 64, { mode: "text", text: "A" });

    expect(firstIndex(ctx, "set:font")).toBeLessThan(firstIndex(ctx, "fillText"));
    expect(only(ctx, "fillText")[0].font).toMatch(/px/);
  });

  it("sets both centring attributes before drawing", () => {
    const ctx = recordingContext();
    drawIcon(ctx, 64, { mode: "text", text: "A" });

    expect(firstIndex(ctx, "set:textAlign")).toBeLessThan(firstIndex(ctx, "fillText"));
    expect(firstIndex(ctx, "set:textBaseline")).toBeLessThan(firstIndex(ctx, "fillText"));
    expect(only(ctx, "set:textAlign")[0].args[0]).toBe("center");
    expect(only(ctx, "set:textBaseline")[0].args[0]).toBe("middle");
  });

  it("picks ink that contrasts with the background it was given", () => {
    const onDark = recordingContext();
    drawIcon(onDark, 64, { mode: "text", text: "A", background: "#000000" });
    expect(only(onDark, "set:fillStyle").at(-1).args[0]).toBe("#ffffff");

    const onLight = recordingContext();
    drawIcon(onLight, 64, { mode: "text", text: "A", background: "#ffffff" });
    expect(only(onLight, "set:fillStyle").at(-1).args[0]).toBe("#111111");
  });

  // With no background there is nothing to contrast against on the canvas, but
  // the icon will sit on a browser tab — which is light far more often than
  // not — so dark ink is the safer assumption.
  it("assumes a light surface when the background is transparent", () => {
    const ctx = recordingContext();
    drawIcon(ctx, 64, { mode: "text", text: "A", background: "transparent" });

    expect(only(ctx, "set:fillStyle").at(-1).args[0]).toBe("#111111");
  });

  it("draws nothing for empty text, and still clears the surface", () => {
    const ctx = recordingContext();
    drawIcon(ctx, 64, { mode: "text", text: "   ", background: "#ffffff" });

    expect(only(ctx, "fillText")).toHaveLength(0);
    expect(only(ctx, "clearRect")).toHaveLength(1);
  });
});

describe("drawIcon — rounded path geometry", () => {
  it("closes the path and stays within the icon bounds", () => {
    const ctx = recordingContext();
    drawIcon(ctx, 64, { mode: "image", background: "#fff", roundness: 0.25 }, SOURCE);

    expect(only(ctx, "closePath").length).toBeGreaterThan(0);

    // Every traced point must sit inside the square; a radius mistake that
    // pushes a corner outside produces a clipped, lopsided shape.
    ["moveTo", "lineTo", "arcTo"].forEach((name) => {
      only(ctx, name).forEach((call) => {
        call.args.slice(0, 4).forEach((value, index) => {
          // arcTo's 5th arg is the radius, not a coordinate — sliced off above.
          if (index < 4) {
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThanOrEqual(64);
          }
        });
      });
    });
  });

  it("survives a full-circle roundness without overlapping arcs", () => {
    const ctx = recordingContext();
    expect(() =>
      drawIcon(ctx, 64, { mode: "image", background: "#fff", roundness: 0.5 }, SOURCE)
    ).not.toThrow();

    // At 0.5 the radius is exactly half the edge, so the straight segments
    // collapse to zero length rather than reversing direction.
    only(ctx, "arcTo").forEach((call) => {
      expect(call.args[4]).toBeLessThanOrEqual(32);
    });
  });
});
