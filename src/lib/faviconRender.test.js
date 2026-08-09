import { describe, it, expect } from "vitest";
import {
  fitRect,
  textFontSize,
  inkFor,
  relativeLuminance,
  cornerRadius,
  hexToRgb,
} from "./faviconRender";

describe("fitRect", () => {
  it("centres a square source exactly, filling the icon", () => {
    expect(fitRect(100, 100, 32)).toEqual({ x: 0, y: 0, width: 32, height: 32 });
  });

  it("contains a wide source, leaving margin above and below", () => {
    const rect = fitRect(200, 100, 32, { fit: "contain" });

    expect(rect.width).toBe(32);
    expect(rect.height).toBe(16);
    // Centred vertically: equal margin top and bottom.
    expect(rect.y).toBe(8);
    expect(rect.y + rect.height).toBe(32 - 8);
    expect(rect.x).toBe(0);
  });

  it("covers a wide source, overflowing horizontally so the square is filled", () => {
    const rect = fitRect(200, 100, 32, { fit: "cover" });

    expect(rect.height).toBe(32);
    expect(rect.width).toBe(64);
    // The overflow is symmetric — that's the crop, half off each side.
    expect(rect.x).toBe(-16);
    expect(rect.y).toBe(0);
  });

  it("never leaves a gap under cover, and never overflows under contain", () => {
    const shapes = [
      [200, 100],
      [100, 200],
      [37, 991],
      [1024, 1024],
      [3, 5],
    ];

    shapes.forEach(([w, h]) => {
      const cover = fitRect(w, h, 64, { fit: "cover" });
      expect(cover.width).toBeGreaterThanOrEqual(64 - 1e-9);
      expect(cover.height).toBeGreaterThanOrEqual(64 - 1e-9);

      const contain = fitRect(w, h, 64, { fit: "contain" });
      expect(contain.width).toBeLessThanOrEqual(64 + 1e-9);
      expect(contain.height).toBeLessThanOrEqual(64 + 1e-9);
    });
  });

  it("preserves the source aspect ratio in both modes", () => {
    ["contain", "cover"].forEach((fit) => {
      const rect = fitRect(300, 200, 48, { fit });
      expect(rect.width / rect.height).toBeCloseTo(300 / 200, 9);
    });
  });

  it("stays centred once padding is applied", () => {
    const rect = fitRect(100, 100, 100, { padding: 0.1 });

    expect(rect.width).toBe(80);
    expect(rect.height).toBe(80);
    expect(rect.x).toBe(10);
    expect(rect.y).toBe(10);
  });

  it("clamps padding to a range that leaves visible artwork", () => {
    // 0.4 is the ceiling; past it there would be more margin than icon.
    expect(fitRect(100, 100, 100, { padding: 5 })).toEqual(
      fitRect(100, 100, 100, { padding: 0.4 })
    );
    expect(fitRect(100, 100, 100, { padding: -3 })).toEqual(
      fitRect(100, 100, 100, { padding: 0 })
    );
    expect(fitRect(100, 100, 100, { padding: NaN })).toEqual(
      fitRect(100, 100, 100, { padding: 0 })
    );
  });

  // A zero or non-finite dimension makes the scale Infinity, and drawImage
  // throws on a non-finite rect rather than skipping it — which would take
  // down every other size in the run over one unreadable file.
  it("returns an empty rect for a degenerate source instead of Infinity", () => {
    [
      [0, 100],
      [100, 0],
      [NaN, 100],
      [100, Infinity],
    ].forEach(([w, h]) => {
      const rect = fitRect(w, h, 32);
      expect(rect).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    });

    expect(fitRect(100, 100, 0)).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});

describe("textFontSize", () => {
  it("shrinks as characters are added, so text keeps fitting", () => {
    const one = textFontSize("A", 100);
    const two = textFontSize("AB", 100);
    const three = textFontSize("ABC", 100);

    expect(one).toBeGreaterThan(two);
    expect(two).toBeGreaterThan(three);
  });

  it("scales linearly with the icon size", () => {
    expect(textFontSize("A", 32) * 2).toBeCloseTo(textFontSize("A", 64), 9);
  });

  it("is zero for empty or whitespace-only text", () => {
    expect(textFontSize("", 64)).toBe(0);
    expect(textFontSize("   ", 64)).toBe(0);
    expect(textFontSize(null, 64)).toBe(0);
  });

  it("counts an emoji as one character, not its code units", () => {
    // "🚀".length is 2 — a naive .length would drop it to the two-character
    // size and render it needlessly small.
    expect(textFontSize("🚀", 100)).toBe(textFontSize("A", 100));
  });

  it("is zero for a zero-size icon", () => {
    expect(textFontSize("A", 0)).toBe(0);
  });
});

describe("inkFor", () => {
  it("puts dark ink on light backgrounds and light ink on dark", () => {
    expect(inkFor("#ffffff")).toBe("#111111");
    expect(inkFor("#f5f5f5")).toBe("#111111");
    expect(inkFor("#000000")).toBe("#ffffff");
    expect(inkFor("#222222")).toBe("#ffffff");
  });

  // The case that a channel-average gets wrong: pure blue averages to mid-grey
  // (85/255) and would be given dark ink, but it looks nearly black because
  // the eye barely registers blue. Luminance weights it at 0.0722.
  it("handles pure blue, where averaging the channels fails", () => {
    expect(inkFor("#0000ff")).toBe("#ffffff");
  });

  it("handles pure green, which is bright despite one channel", () => {
    expect(inkFor("#00ff00")).toBe("#111111");
  });

  it("always picks the higher-contrast option", () => {
    const contrast = (a, b) => {
      const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
      return (light + 0.05) / (dark + 0.05);
    };

    ["#ffffff", "#000000", "#0000ff", "#00ff00", "#ff0000", "#808080", "#2b7a3f", "#ffd400"].forEach(
      (background) => {
        const chosen = inkFor(background);
        const other = chosen === "#111111" ? "#ffffff" : "#111111";

        expect(contrast(background, chosen)).toBeGreaterThanOrEqual(contrast(background, other));
      }
    );
  });

  it("falls back to dark ink for an unreadable colour", () => {
    expect(inkFor("nonsense")).toBe("#111111");
    expect(inkFor(null)).toBe("#111111");
  });
});

describe("relativeLuminance", () => {
  it("anchors at the endpoints defined by WCAG", () => {
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 9);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 9);
  });

  it("ranks the primaries by perceived brightness", () => {
    const green = relativeLuminance("#00ff00");
    const red = relativeLuminance("#ff0000");
    const blue = relativeLuminance("#0000ff");

    expect(green).toBeGreaterThan(red);
    expect(red).toBeGreaterThan(blue);
  });

  it("returns null for an unparseable colour", () => {
    expect(relativeLuminance("#12345")).toBeNull();
    expect(relativeLuminance("")).toBeNull();
  });
});

describe("cornerRadius", () => {
  it("scales with the icon so the shape looks identical at every size", () => {
    expect(cornerRadius(16, 0.25) / 16).toBeCloseTo(cornerRadius(512, 0.25) / 512, 9);
  });

  it("caps at half the edge, where the square is already a circle", () => {
    expect(cornerRadius(100, 0.5)).toBe(50);
    expect(cornerRadius(100, 9)).toBe(50);
  });

  it("is zero for no roundness or a nonsense value", () => {
    expect(cornerRadius(100, 0)).toBe(0);
    expect(cornerRadius(100, -1)).toBe(0);
    expect(cornerRadius(100, NaN)).toBe(0);
    expect(cornerRadius(0, 0.25)).toBe(0);
  });
});

describe("hexToRgb", () => {
  it("reads both shorthand and full form, with or without the hash", () => {
    expect(hexToRgb("#fff")).toEqual([255, 255, 255]);
    expect(hexToRgb("fff")).toEqual([255, 255, 255]);
    expect(hexToRgb("#1a2b3c")).toEqual([26, 43, 60]);
  });

  it("returns null rather than partial garbage", () => {
    ["#12345", "xyz", "", null, undefined].forEach((value) => {
      expect(hexToRgb(value)).toBeNull();
    });
  });
});
