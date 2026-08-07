import { describe, it, expect } from "vitest";
import {
  LAYOUTS,
  POSITIONS,
  ROTATIONS,
  OPACITIES,
  TEXT_SIZES,
  IMAGE_SIZES,
  COLORS,
  FONT_FAMILIES,
  TILE_DENSITIES,
  MAX_TILES_PER_IMAGE,
  MAX_TEXT_LENGTH,
  DEFAULT_SETTINGS,
  EDGE_MARGIN_SCALE,
  findLayout,
  findPosition,
  findRotation,
  findOpacity,
  findTextSize,
  findImageSize,
  findColor,
  findFont,
  findDensity,
  resolveFontSize,
  resolveLogoSize,
  rotatedFootprint,
  planMarks,
  validateWatermarkText,
  fontShorthand,
  outlineWidth,
  describeWatermark,
} from "./imageWatermark";

// A landscape photo and a portrait one. Both are used throughout rather than a
// single square, because a square hides every width/height transposition — the
// most likely mistake in placement code and one that a square test can never
// catch.
const LANDSCAPE = { width: 1600, height: 900 };
const PORTRAIT = { width: 900, height: 1600 };

describe("lookups", () => {
  it("finds each preset by id", () => {
    for (const layout of LAYOUTS) expect(findLayout(layout.id)).toBe(layout);
    for (const position of POSITIONS) expect(findPosition(position.id)).toBe(position);
    for (const rotation of ROTATIONS) expect(findRotation(rotation.id)).toBe(rotation);
    for (const opacity of OPACITIES) expect(findOpacity(opacity.id)).toBe(opacity);
    for (const size of TEXT_SIZES) expect(findTextSize(size.id)).toBe(size);
    for (const size of IMAGE_SIZES) expect(findImageSize(size.id)).toBe(size);
    for (const color of COLORS) expect(findColor(color.id)).toBe(color);
    for (const font of FONT_FAMILIES) expect(findFont(font.id)).toBe(font);
    for (const density of TILE_DENSITIES) expect(findDensity(density.id)).toBe(density);
  });

  // Falling back rather than throwing: an unknown id can only come from a stale
  // setting, and stamping at the default beats failing the whole batch.
  it("falls back to a usable default for unknown ids", () => {
    expect(findPosition("nowhere").id).toBe("bottom-right");
    expect(findRotation("sideways").degrees).toBe(0);
    expect(findOpacity("invisible").value).toBe(0.55);
    expect(findTextSize("enormous").id).toBe("medium");
    expect(findColor("puce").id).toBe("white");
    expect(findFont("comic").id).toBe("sans");
    expect(findDensity("packed").id).toBe("normal");
  });

  it("every default in DEFAULT_SETTINGS names a real preset", () => {
    // A default that doesn't resolve would silently fall back to index 0, which
    // is a plausible-looking mark in the wrong place — no error anywhere.
    expect(findLayout(DEFAULT_SETTINGS.layoutId).id).toBe(DEFAULT_SETTINGS.layoutId);
    expect(findPosition(DEFAULT_SETTINGS.positionId).id).toBe(DEFAULT_SETTINGS.positionId);
    expect(findRotation(DEFAULT_SETTINGS.rotationId).id).toBe(DEFAULT_SETTINGS.rotationId);
    expect(findOpacity(DEFAULT_SETTINGS.opacityId).id).toBe(DEFAULT_SETTINGS.opacityId);
    expect(findTextSize(DEFAULT_SETTINGS.textSizeId).id).toBe(DEFAULT_SETTINGS.textSizeId);
    expect(findImageSize(DEFAULT_SETTINGS.imageSizeId).id).toBe(DEFAULT_SETTINGS.imageSizeId);
    expect(findColor(DEFAULT_SETTINGS.colorId).id).toBe(DEFAULT_SETTINGS.colorId);
    expect(findFont(DEFAULT_SETTINGS.fontId).id).toBe(DEFAULT_SETTINGS.fontId);
    expect(findDensity(DEFAULT_SETTINGS.densityId).id).toBe(DEFAULT_SETTINGS.densityId);
  });

  it("offers a full 3x3 grid of positions", () => {
    const combinations = POSITIONS.map((p) => `${p.vertical}-${p.horizontal}`);
    expect(new Set(combinations).size).toBe(9);
  });

  // The band is deliberately higher than the PDF tool's 0.08-0.4. Copying that
  // range across would make an image credit invisible on a photo, and the user's
  // reasonable conclusion would be that the tool did nothing at all.
  it("keeps opacity in the band an image mark is actually visible in", () => {
    for (const opacity of OPACITIES) {
      expect(opacity.value).toBeGreaterThanOrEqual(0.2);
      expect(opacity.value).toBeLessThanOrEqual(1);
    }
    expect(Math.max(...OPACITIES.map((o) => o.value))).toBe(1);
  });

  // Every colour needs a contrasting stroke or it vanishes over part of a real
  // photograph — white over sky, black over shadow.
  it("gives every colour an outline that contrasts with it", () => {
    for (const color of COLORS) {
      expect(color.outline, color.id).toBeTruthy();
      expect(color.outline, color.id).not.toBe(color.hex);
    }
  });
});

describe("resolveFontSize", () => {
  // Scaled to the shorter edge so a landscape image and its portrait equivalent
  // get the same mark, rather than the landscape one getting a mark 78% bigger
  // purely because it is wider.
  it("scales to the shorter edge, so orientation doesn't change the mark", () => {
    const landscape = resolveFontSize("medium", LANDSCAPE.width, LANDSCAPE.height);
    const portrait = resolveFontSize("medium", PORTRAIT.width, PORTRAIT.height);
    expect(landscape).toBeCloseTo(portrait);
    expect(landscape).toBeCloseTo(900 * 0.05);
  });

  // The reason the sizes are fractions at all: one settings object runs across a
  // whole batch of differently-sized images.
  it("gives a proportionally identical mark across a mixed batch", () => {
    const small = resolveFontSize("medium", 500, 500);
    const large = resolveFontSize("medium", 5000, 5000);
    expect(large / small).toBeCloseTo(10);
  });

  it("orders the presets small to huge", () => {
    const sizes = TEXT_SIZES.map((s) => resolveFontSize(s.id, 1000, 1000));
    expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
    expect(new Set(sizes).size).toBe(sizes.length);
  });

  // An illegible watermark credits nobody, so the floor matters more than the
  // proportion on a very small source.
  it("floors at a legible size on tiny images", () => {
    expect(resolveFontSize("small", 60, 60)).toBe(10);
  });

  it("survives a missing or zero-sized image", () => {
    expect(resolveFontSize("medium", 0, 0)).toBe(24);
    expect(resolveFontSize("medium", undefined, undefined)).toBe(24);
    expect(Number.isFinite(resolveFontSize("medium", NaN, 100))).toBe(true);
  });
});

describe("resolveLogoSize", () => {
  it("preserves the logo's aspect ratio", () => {
    const { width, height } = resolveLogoSize("medium", 400, 100, 1600, 900);
    expect(width / height).toBeCloseTo(4);
  });

  it("scales a tall logo to the same width as a wide one", () => {
    // The scale names a WIDTH, so two logos of different shapes both land at the
    // requested width and differ only in height. Anything else makes "medium"
    // mean two different things depending on the logo.
    const wide = resolveLogoSize("medium", 400, 100, 1000, 1000);
    const tall = resolveLogoSize("medium", 100, 400, 1000, 1000);
    expect(wide.width).toBeCloseTo(tall.width);
    expect(tall.height).toBeCloseTo(wide.width * 4);
  });

  it("returns nothing for a logo with no dimensions", () => {
    expect(resolveLogoSize("medium", 0, 0, 1000, 1000)).toEqual({ width: 0, height: 0 });
    expect(resolveLogoSize("medium", 400, 100, 0, 0)).toEqual({ width: 0, height: 0 });
  });
});

describe("rotatedFootprint", () => {
  it("leaves an unrotated box alone", () => {
    expect(rotatedFootprint(300, 20, 0)).toEqual({ width: 300, height: 20 });
  });

  it("swaps the axes at a quarter turn", () => {
    const turned = rotatedFootprint(300, 20, 90);
    expect(turned.width).toBeCloseTo(20);
    expect(turned.height).toBeCloseTo(300);
  });

  // The number that matters: a 300x20 label at 45° occupies roughly 226x226,
  // more than eleven times its own height. Tiling against the raw height would
  // overlap every neighbour.
  it("reports the much larger box a diagonal mark really occupies", () => {
    const diagonal = rotatedFootprint(300, 20, 45);
    expect(diagonal.width).toBeCloseTo(226.27, 1);
    expect(diagonal.height).toBeCloseTo(226.27, 1);
    expect(diagonal.height).toBeGreaterThan(20 * 11);
  });

  // Canvas takes clockwise angles and the presets include negatives; the
  // footprint is the same either way, which is what lets one function serve both
  // this module and the PDF one.
  it("is symmetric in the sign of the angle", () => {
    expect(rotatedFootprint(300, 20, -45)).toEqual(rotatedFootprint(300, 20, 45));
    expect(rotatedFootprint(300, 20, -90).width).toBeCloseTo(
      rotatedFootprint(300, 20, 90).width
    );
  });
});

// ---------------------------------------------------------------------------
// The block that matters most in this file.
//
// pdfPageNumbers.js records the lesson: when a function's job is to place
// something in a coordinate system, a test that recomputes the placement passes
// just as happily when the mapping is inverted. Every per-angle unit test there
// passed against a 90°/270° mapping that was written backwards.
//
// So these do not recompute. They assert the property a human would check by
// looking at the output: which HALF of the image the mark landed in. Canvas y
// grows downward, so "top" must be a SMALL y — and that single fact is the one
// this module inverts relative to pdfWatermark.js. If singleCenter's vertical
// branch were copied from the PDF version unchanged, every assertion below
// about top and bottom would fail, which is precisely the point.
// ---------------------------------------------------------------------------
describe("planMarks — single, placed in canvas space (y grows DOWNWARD)", () => {
  const mark = { markWidth: 200, markHeight: 40 };

  function place(positionId, image = LANDSCAPE, rotation = 0) {
    const [center] = planMarks({
      layoutId: "single",
      positionId,
      ...mark,
      rotation,
      width: image.width,
      height: image.height,
    });
    return center;
  }

  it("puts a top mark in the upper half and a bottom mark in the lower half", () => {
    // The assertion that catches a copied bottom-left-origin mapping.
    expect(place("top-left").y).toBeLessThan(LANDSCAPE.height / 2);
    expect(place("top-center").y).toBeLessThan(LANDSCAPE.height / 2);
    expect(place("top-right").y).toBeLessThan(LANDSCAPE.height / 2);

    expect(place("bottom-left").y).toBeGreaterThan(LANDSCAPE.height / 2);
    expect(place("bottom-center").y).toBeGreaterThan(LANDSCAPE.height / 2);
    expect(place("bottom-right").y).toBeGreaterThan(LANDSCAPE.height / 2);
  });

  it("puts a left mark in the left half and a right mark in the right half", () => {
    expect(place("top-left").x).toBeLessThan(LANDSCAPE.width / 2);
    expect(place("middle-left").x).toBeLessThan(LANDSCAPE.width / 2);
    expect(place("bottom-left").x).toBeLessThan(LANDSCAPE.width / 2);

    expect(place("top-right").x).toBeGreaterThan(LANDSCAPE.width / 2);
    expect(place("middle-right").x).toBeGreaterThan(LANDSCAPE.width / 2);
    expect(place("bottom-right").x).toBeGreaterThan(LANDSCAPE.width / 2);
  });

  it("centres the centre", () => {
    const center = place("center");
    expect(center.x).toBeCloseTo(LANDSCAPE.width / 2);
    expect(center.y).toBeCloseTo(LANDSCAPE.height / 2);
  });

  it("holds all nine positions apart from each other", () => {
    const points = POSITIONS.map((p) => {
      const { x, y } = place(p.id);
      return `${Math.round(x)},${Math.round(y)}`;
    });
    expect(new Set(points).size).toBe(9);
  });

  // Transposition check. On a portrait image the same nine positions must still
  // land in the right halves; a swapped width/height would put "bottom-right"
  // off the canvas entirely on one orientation and pass on the other.
  it("places correctly on a portrait image too", () => {
    expect(place("top-left", PORTRAIT).y).toBeLessThan(PORTRAIT.height / 2);
    expect(place("bottom-right", PORTRAIT).y).toBeGreaterThan(PORTRAIT.height / 2);
    expect(place("bottom-right", PORTRAIT).x).toBeGreaterThan(PORTRAIT.width / 2);
  });

  // The mark must sit fully on the image — this is what the footprint inset
  // buys, and it is checked against the ROTATED extent, not the raw one.
  it("keeps the whole mark on the image at every position and angle", () => {
    for (const image of [LANDSCAPE, PORTRAIT]) {
      for (const position of POSITIONS) {
        for (const rotation of ROTATIONS) {
          const center = place(position.id, image, rotation.degrees);
          const footprint = rotatedFootprint(mark.markWidth, mark.markHeight, rotation.degrees);

          const label = `${position.id} @ ${rotation.id} on ${image.width}x${image.height}`;
          expect(center.x - footprint.width / 2, label).toBeGreaterThanOrEqual(0);
          expect(center.y - footprint.height / 2, label).toBeGreaterThanOrEqual(0);
          expect(center.x + footprint.width / 2, label).toBeLessThanOrEqual(image.width);
          expect(center.y + footprint.height / 2, label).toBeLessThanOrEqual(image.height);
        }
      }
    }
  });

  // A diagonal mark is much TALLER than its own box, so it must be inset
  // further up from the bottom edge than a horizontal one. Placing against the
  // unrotated size is the specific bug this catches.
  //
  // Only the vertical axis is asserted, and that is not an oversight. A wide
  // 200x40 label rotated 45° has a footprint of about 170x170: taller than its
  // 40px height, but genuinely *narrower* than its 200px width. So the correct
  // horizontal inset is smaller, and asserting "further in on both axes" — the
  // intuitive version — fails against correct code. The height relation is the
  // one that holds for any mark wider than it is tall, which is every text mark.
  it("insets a diagonal mark further from the bottom edge than a horizontal one", () => {
    const horizontal = place("bottom-right", LANDSCAPE, 0);
    const diagonal = place("bottom-right", LANDSCAPE, -45);
    expect(diagonal.y).toBeLessThan(horizontal.y);

    // The x inset follows the footprint too — it just points the other way for
    // a wide mark. Asserted explicitly so the asymmetry is recorded rather than
    // looking like a forgotten axis.
    const horizontalFootprint = rotatedFootprint(mark.markWidth, mark.markHeight, 0);
    const diagonalFootprint = rotatedFootprint(mark.markWidth, mark.markHeight, -45);
    expect(diagonalFootprint.width).toBeLessThan(horizontalFootprint.width);
    expect(diagonal.x).toBeGreaterThan(horizontal.x);
  });

  it("respects the edge margin rather than sitting flush against the trim", () => {
    const center = place("top-left", LANDSCAPE, 0);
    const expected = Math.min(LANDSCAPE.width, LANDSCAPE.height) * EDGE_MARGIN_SCALE;
    expect(center.x - mark.markWidth / 2).toBeCloseTo(expected);
    expect(center.y - mark.markHeight / 2).toBeCloseTo(expected);
  });

  // A mark bigger than the image can't be inset anywhere; centring still marks
  // the image, which is what was asked for. Pushing it past the far edge — the
  // naive result — would mark nothing at all.
  it("centres a mark larger than the image instead of pushing it off", () => {
    const [center] = planMarks({
      layoutId: "single",
      positionId: "bottom-right",
      markWidth: 4000,
      markHeight: 3000,
      rotation: 0,
      width: 400,
      height: 300,
    });
    expect(center.x).toBeCloseTo(200);
    expect(center.y).toBeCloseTo(150);
  });
});

describe("planMarks — tiled", () => {
  function tile(densityId, image = LANDSCAPE, rotation = 0, mark = { w: 200, h: 40 }) {
    return planMarks({
      layoutId: "tile",
      markWidth: mark.w,
      markHeight: mark.h,
      rotation,
      densityId,
      width: image.width,
      height: image.height,
    });
  }

  it("covers the image with more than one mark", () => {
    expect(tile("normal").length).toBeGreaterThan(1);
  });

  it("gets denser as the density preset rises", () => {
    expect(tile("dense").length).toBeGreaterThan(tile("normal").length);
    expect(tile("normal").length).toBeGreaterThan(tile("sparse").length);
  });

  // The grid must overhang the edges. A grid that stopped at the boundary
  // leaves an unmarked border — it looks unfinished, and it hands anyone
  // cropping the image a clean strip.
  it("extends past every edge so no unmarked border is left", () => {
    const marks = tile("normal");
    const xs = marks.map((m) => m.x);
    const ys = marks.map((m) => m.y);

    expect(Math.min(...xs)).toBeLessThanOrEqual(0);
    expect(Math.min(...ys)).toBeLessThanOrEqual(0);
    expect(Math.max(...xs)).toBeGreaterThanOrEqual(LANDSCAPE.width);
    expect(Math.max(...ys)).toBeGreaterThanOrEqual(LANDSCAPE.height);
  });

  it("lays out a symmetric grid centred on the image", () => {
    const marks = tile("normal");
    const xs = marks.map((m) => m.x);
    const ys = marks.map((m) => m.y);

    // The centroid of a symmetric grid is the image centre.
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(LANDSCAPE.width / 2);
    expect((Math.min(...ys) + Math.max(...ys)) / 2).toBeCloseTo(LANDSCAPE.height / 2);
  });

  it("spaces tiles evenly", () => {
    const marks = tile("normal");
    const uniqueXs = [...new Set(marks.map((m) => Math.round(m.x * 100)))].sort((a, b) => a - b);
    const gaps = uniqueXs.slice(1).map((x, i) => x - uniqueXs[i]);
    for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0], 0);
  });

  // The cap exists because each tile is a real canvas draw with a stroke and a
  // rotation, paid again for every image in the batch.
  it("never exceeds the tile cap, however small the mark", () => {
    for (const density of TILE_DENSITIES) {
      const marks = tile(density.id, { width: 6000, height: 6000 }, 0, { w: 4, h: 2 });
      expect(marks.length, density.id).toBeLessThanOrEqual(MAX_TILES_PER_IMAGE);
    }
  });

  // Applied by growing the step, not by truncating the grid. Truncation would
  // cover part of the image and leave the rest bare, which reads as a bug.
  it("still covers the whole image when the cap bites", () => {
    const marks = tile("dense", { width: 6000, height: 6000 }, 0, { w: 4, h: 2 });
    expect(marks.length).toBeLessThanOrEqual(MAX_TILES_PER_IMAGE);
    expect(Math.min(...marks.map((m) => m.x))).toBeLessThanOrEqual(0);
    expect(Math.max(...marks.map((m) => m.x))).toBeGreaterThanOrEqual(6000);
    expect(Math.min(...marks.map((m) => m.y))).toBeLessThanOrEqual(0);
    expect(Math.max(...marks.map((m) => m.y))).toBeGreaterThanOrEqual(6000);
  });

  // A diagonal mark's footprint is much larger, so the same density must
  // produce fewer tiles — otherwise they overlap at exactly the angle where
  // overlap is most visible.
  it("uses the rotated footprint for spacing, so diagonals don't overlap", () => {
    expect(tile("normal", LANDSCAPE, -45).length).toBeLessThan(
      tile("normal", LANDSCAPE, 0).length
    );
  });

  // A mark of 1e-12 is non-zero, so a `step > 0` guard passes it straight
  // through — and dividing it into a 1000px width asks for a grid of 1e15
  // tiles. The original guard did exactly that and this test caught it.
  it("falls back to a single centred mark on a vanishingly small footprint", () => {
    const marks = planMarks({
      layoutId: "tile",
      markWidth: 1e-12,
      markHeight: 1e-12,
      rotation: 0,
      densityId: "normal",
      width: 1000,
      height: 800,
    });
    expect(marks).toEqual([{ x: 500, y: 400 }]);
  });

  // The cap is the backstop for everything the guard above lets through, so it
  // is asserted across a deliberately hostile range rather than one case.
  it("holds the cap across every combination of tiny mark and huge image", () => {
    for (const size of [0.5, 1, 2, 8]) {
      for (const edge of [2000, 6000, 20000]) {
        for (const density of TILE_DENSITIES) {
          const marks = planMarks({
            layoutId: "tile",
            markWidth: size,
            markHeight: size,
            rotation: 0,
            densityId: density.id,
            width: edge,
            height: edge,
          });
          expect(marks.length, `${size}px mark on ${edge}px @ ${density.id}`).toBeLessThanOrEqual(
            MAX_TILES_PER_IMAGE
          );
        }
      }
    }
  });
});

describe("planMarks — guards", () => {
  it("returns nothing rather than throwing on missing dimensions", () => {
    const base = {
      layoutId: "single",
      positionId: "center",
      markWidth: 100,
      markHeight: 20,
      width: 1000,
      height: 800,
    };
    expect(planMarks({ ...base, width: 0 })).toEqual([]);
    expect(planMarks({ ...base, height: 0 })).toEqual([]);
    expect(planMarks({ ...base, markWidth: 0 })).toEqual([]);
    expect(planMarks({ ...base, markHeight: NaN })).toEqual([]);
    expect(planMarks({})).toEqual([]);
  });
});

describe("validateWatermarkText", () => {
  it("accepts ordinary text", () => {
    expect(validateWatermarkText("© Wary Tools")).toEqual({ ok: true, text: "© Wary Tools" });
  });

  it("trims and collapses whitespace", () => {
    // Newlines arrive from pasted text, and every size preset is calibrated for
    // a single line.
    expect(validateWatermarkText("  © Jane\n  Doe  ")).toEqual({ ok: true, text: "© Jane Doe" });
  });

  it("rejects empty or whitespace-only text", () => {
    expect(validateWatermarkText("").ok).toBe(false);
    expect(validateWatermarkText("   ").ok).toBe(false);
    expect(validateWatermarkText(null).ok).toBe(false);
    expect(validateWatermarkText(undefined).ok).toBe(false);
  });

  it("rejects text past the length limit", () => {
    expect(validateWatermarkText("a".repeat(MAX_TEXT_LENGTH)).ok).toBe(true);
    expect(validateWatermarkText("a".repeat(MAX_TEXT_LENGTH + 1)).ok).toBe(false);
  });

  // The deliberate difference from pdfWatermark.validateWatermarkText, which
  // rejects all of these because pdf-lib's standard fonts are WinAnsi-encoded.
  // Canvas draws whatever the system font has, so refusing them here would be an
  // invented restriction copied from a constraint that does not apply.
  it("accepts non-Latin scripts and emoji, unlike the PDF watermark", () => {
    expect(validateWatermarkText("मेरी तस्वीर").ok).toBe(true);
    expect(validateWatermarkText("版权所有").ok).toBe(true);
    expect(validateWatermarkText("© 2026 📷").ok).toBe(true);
    expect(validateWatermarkText("Ünïcodé — “smart quotes”").ok).toBe(true);
  });
});

describe("fontShorthand", () => {
  // The preview and the export render on different canvases (DOM vs
  // OffscreenCanvas). If they request different fonts, the preview's measured
  // width is wrong — and that width is what the entire placement derives from.
  it("builds a valid canvas font shorthand", () => {
    expect(fontShorthand("sans", 48)).toBe("bold 48px sans-serif");
    expect(fontShorthand("serif", 20)).toBe("bold 20px serif");
    expect(fontShorthand("mono", 12)).toBe("bold 12px monospace");
  });

  it("rounds fractional sizes, which resolveFontSize routinely produces", () => {
    expect(fontShorthand("sans", 47.6)).toBe("bold 48px sans-serif");
  });

  it("never emits a zero or negative size", () => {
    // "0px sans-serif" is a valid string that draws nothing at all — an empty
    // output with no error anywhere.
    expect(fontShorthand("sans", 0)).toBe("bold 1px sans-serif");
    expect(fontShorthand("sans", -10)).toBe("bold 1px sans-serif");
    expect(fontShorthand("sans", NaN)).toBe("bold 1px sans-serif");
  });

  it("falls back to the default family for an unknown id", () => {
    expect(fontShorthand("papyrus", 16)).toBe("bold 16px sans-serif");
  });
});

describe("outlineWidth", () => {
  // Proportional, because a 1px stroke that reads well behind 16px text is
  // invisible behind 200px text — and the presets span that whole range.
  it("scales with the font size", () => {
    expect(outlineWidth(200)).toBeGreaterThan(outlineWidth(20));
    expect(outlineWidth(100)).toBeCloseTo(5.5);
  });

  it("never drops below a visible hairline", () => {
    expect(outlineWidth(10)).toBe(1);
    expect(outlineWidth(0)).toBe(1);
    expect(outlineWidth(undefined)).toBe(1);
  });
});

describe("describeWatermark", () => {
  it("describes a single mark by its position", () => {
    expect(
      describeWatermark({
        imageCount: 3,
        marksPerImage: 1,
        layoutId: "single",
        positionId: "bottom-right",
      })
    ).toBe("3 images, one mark at bottom right.");
  });

  it("describes a tiled mark by its approximate count", () => {
    expect(
      describeWatermark({ imageCount: 1, marksPerImage: 12, layoutId: "tile" })
    ).toBe("1 image, tiled with about 12 marks each.");
  });

  it("gets the singulars right", () => {
    expect(
      describeWatermark({ imageCount: 1, marksPerImage: 1, layoutId: "tile" })
    ).toBe("1 image, tiled with about 1 mark each.");
  });

  it("says nothing will happen when there is nothing to do", () => {
    expect(describeWatermark({ imageCount: 0 })).toBe("No images will be watermarked.");
  });
});
