import { describe, it, expect } from "vitest";
import {
  LAYOUTS,
  POSITIONS,
  ROTATIONS,
  OPACITIES,
  TEXT_SIZES,
  COLORS,
  TILE_DENSITIES,
  MAX_TILES_PER_PAGE,
  MAX_TEXT_LENGTH,
  findPosition,
  findRotation,
  findOpacity,
  findColor,
  findDensity,
  hexToRgb01,
  resolveFontSize,
  resolveImageSize,
  rotatedFootprint,
  originForCenteredMark,
  displayToUserSpace,
  normalizeAngle,
  planMarks,
  validateWatermarkText,
  findUnsupportedCharacters,
  describeWatermark,
} from "./pdfWatermark";

const A4 = { x: 0, y: 0, width: 595.28, height: 841.89 };

describe("lookups", () => {
  it("finds each preset by id", () => {
    for (const position of POSITIONS) expect(findPosition(position.id)).toBe(position);
    for (const rotation of ROTATIONS) expect(findRotation(rotation.id)).toBe(rotation);
    for (const opacity of OPACITIES) expect(findOpacity(opacity.id)).toBe(opacity);
    for (const color of COLORS) expect(findColor(color.id)).toBe(color);
    for (const density of TILE_DENSITIES) expect(findDensity(density.id)).toBe(density);
  });

  // Falling back rather than throwing: an unknown id can only come from a stale
  // setting, and stamping at the default beats failing the whole run.
  it("falls back to a usable default for unknown ids", () => {
    expect(findPosition("nowhere").id).toBe("center");
    expect(findRotation("sideways").degrees).toBe(45);
    expect(findOpacity("invisible").value).toBe(0.15);
    expect(findColor("puce").id).toBe("grey");
    expect(findDensity("packed").id).toBe("normal");
  });

  it("offers both layouts with distinct ids", () => {
    expect(LAYOUTS.map((layout) => layout.id)).toEqual(["single", "tile"]);
  });

  // Opacity outside this band produces a mark that is either invisible or makes
  // the document unreadable — the two ways this feature fails in practice.
  it("keeps every opacity preset in the useful band", () => {
    for (const opacity of OPACITIES) {
      expect(opacity.value).toBeGreaterThan(0.05);
      expect(opacity.value).toBeLessThanOrEqual(0.6);
    }
  });
});

describe("hexToRgb01", () => {
  // pdf-lib's rgb() takes 0-1 floats. Handing it 0-255 bytes doesn't throw — it
  // clamps, so every mark comes out pure white or fully saturated and it reads
  // as a styling mistake rather than a bug.
  it("converts to 0-1 components, not 0-255", () => {
    expect(hexToRgb01("#000000")).toEqual({ r: 0, g: 0, b: 0 });
    expect(hexToRgb01("#ffffff")).toEqual({ r: 1, g: 1, b: 1 });

    const grey = hexToRgb01("#808080");
    expect(grey.r).toBeCloseTo(128 / 255);
    expect(grey.r).toBe(grey.g);
    expect(grey.g).toBe(grey.b);
  });

  it("expands three-digit hex", () => {
    expect(hexToRgb01("#fff")).toEqual({ r: 1, g: 1, b: 1 });
  });

  it("falls back to mid-grey for malformed input", () => {
    expect(hexToRgb01("nonsense")).toEqual({ r: 0.5, g: 0.5, b: 0.5 });
    expect(hexToRgb01(null)).toEqual({ r: 0.5, g: 0.5, b: 0.5 });
  });

  it("keeps every offered colour in range", () => {
    for (const color of COLORS) {
      const { r, g, b } = hexToRgb01(color.hex);
      for (const channel of [r, g, b]) {
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("resolveFontSize", () => {
  // Scaled to the page rather than fixed, because 48pt is "large" on A4 and a
  // caption on A0.
  it("scales with the page", () => {
    const onA4 = resolveFontSize("medium", A4.width, A4.height);
    const onA6 = resolveFontSize("medium", A4.width / 2, A4.height / 2);
    expect(onA4).toBeCloseTo(onA6 * 2);
  });

  // Measured against the SHORT edge, so a landscape page and its portrait
  // equivalent get the same mark instead of one being 40% larger.
  it("measures against the short edge, so orientation doesn't change the size", () => {
    const portrait = resolveFontSize("medium", A4.width, A4.height);
    const landscape = resolveFontSize("medium", A4.height, A4.width);
    expect(portrait).toBeCloseTo(landscape);
  });

  it("orders the presets small < medium < large", () => {
    const sizes = TEXT_SIZES.map((size) => resolveFontSize(size.id, A4.width, A4.height));
    expect(sizes[0]).toBeLessThan(sizes[1]);
    expect(sizes[1]).toBeLessThan(sizes[2]);
  });

  // An illegible watermark protects nothing, so a tiny page still gets readable
  // text rather than a proportionally-correct smudge.
  it("floors at a legible size on a very small page", () => {
    expect(resolveFontSize("small", 40, 60)).toBeGreaterThanOrEqual(8);
  });

  it("survives a missing page size", () => {
    expect(resolveFontSize("medium", 0, 0)).toBeGreaterThan(0);
    expect(resolveFontSize("medium", NaN, NaN)).toBeGreaterThan(0);
  });
});

describe("resolveImageSize", () => {
  it("preserves the image's aspect ratio", () => {
    const { width, height } = resolveImageSize("medium", 800, 400, A4.width, A4.height);
    expect(width / height).toBeCloseTo(2);
  });

  it("returns nothing drawable for a missing image", () => {
    expect(resolveImageSize("medium", 0, 0, A4.width, A4.height)).toEqual({ width: 0, height: 0 });
  });
});

describe("rotatedFootprint", () => {
  // The trap specific to watermarks: a diagonal mark occupies far more space
  // than its own width and height. Placing against the unrotated dimensions runs
  // it off the page edge and makes tiles overlap, with nothing erroring.
  it("is unchanged at 0 degrees", () => {
    expect(rotatedFootprint(300, 20, 0)).toEqual({ width: 300, height: 20 });
  });

  it("swaps the axes at 90 degrees", () => {
    const box = rotatedFootprint(300, 20, 90);
    expect(box.width).toBeCloseTo(20);
    expect(box.height).toBeCloseTo(300);
  });

  it("is much larger than the raw mark at 45 degrees", () => {
    const box = rotatedFootprint(300, 20, 45);
    // (300 + 20) / sqrt(2) on both axes.
    expect(box.width).toBeCloseTo(226.27, 1);
    expect(box.height).toBeCloseTo(226.27, 1);
    expect(box.height).toBeGreaterThan(20 * 10);
  });

  // Compared with a tolerance rather than deep equality: cos/sin of mirrored
  // angles differ in the last float bit, so an exact comparison fails on a
  // result that is correct.
  it("treats mirrored angles identically", () => {
    const base = rotatedFootprint(300, 20, 45);
    for (const mirrored of [315, 135, 225]) {
      const box = rotatedFootprint(300, 20, mirrored);
      expect(box.width, `${mirrored}deg`).toBeCloseTo(base.width, 9);
      expect(box.height, `${mirrored}deg`).toBeCloseTo(base.height, 9);
    }
  });
});

describe("originForCenteredMark", () => {
  // pdf-lib rotates about the origin passed in — the mark's bottom-left corner,
  // not its centre. Passing the page centre directly swings a diagonal mark off
  // up and to the left by an amount that grows with the mark's size.
  it("is a plain half-size offset when unrotated", () => {
    const origin = originForCenteredMark(300, 400, 200, 40, 0);
    expect(origin.x).toBeCloseTo(200);
    expect(origin.y).toBeCloseTo(380);
  });

  // The assertion that actually proves the offset: rotate the mark's own centre
  // back through the same transform and check it lands on the requested point.
  // Recomputing the trigonometry here would pass just as happily with the sign
  // inverted.
  for (const degrees of [0, 45, 90, 180, 270, 315]) {
    it(`puts the mark's centre on the requested point at ${degrees} degrees`, () => {
      const width = 260;
      const height = 34;
      const targetX = 300;
      const targetY = 400;

      const origin = originForCenteredMark(targetX, targetY, width, height, degrees);

      // Where the mark's centre ends up once pdf-lib rotates it about `origin`.
      const radians = (degrees * Math.PI) / 180;
      const cos = Math.cos(radians);
      const sin = Math.sin(radians);
      const centerX = origin.x + (width / 2) * cos - (height / 2) * sin;
      const centerY = origin.y + (width / 2) * sin + (height / 2) * cos;

      expect(centerX).toBeCloseTo(targetX, 6);
      expect(centerY).toBeCloseTo(targetY, 6);
    });
  }
});

describe("normalizeAngle", () => {
  // Real files carry these. An un-normalised angle falls through to the
  // unrotated branch and silently mis-places every mark on the page.
  it("normalises negatives and values above 360", () => {
    expect(normalizeAngle(-90)).toBe(270);
    expect(normalizeAngle(-270)).toBe(90);
    expect(normalizeAngle(450)).toBe(90);
    expect(normalizeAngle(720)).toBe(0);
  });

  it("snaps near-quarter-turn values", () => {
    expect(normalizeAngle(89)).toBe(90);
    expect(normalizeAngle(0)).toBe(0);
    expect(normalizeAngle(undefined)).toBe(0);
  });
});

describe("planMarks: single layout", () => {
  it("returns exactly one mark", () => {
    const marks = planMarks({
      layoutId: "single",
      positionId: "center",
      markWidth: 200,
      markHeight: 30,
      markRotation: 45,
      box: A4,
    });
    expect(marks).toHaveLength(1);
  });

  it("returns nothing for a degenerate mark or page", () => {
    expect(planMarks({ layoutId: "single", markWidth: 0, markHeight: 30, box: A4 })).toEqual([]);
    expect(
      planMarks({ layoutId: "single", markWidth: 200, markHeight: 30, box: { width: 0, height: 0 } })
    ).toEqual([]);
  });

  it("carries the mark's own rotation through to the draw call", () => {
    const [mark] = planMarks({
      layoutId: "single",
      positionId: "center",
      markWidth: 200,
      markHeight: 30,
      markRotation: 45,
      box: A4,
    });
    expect(mark.rotate).toBe(45);
  });

  // The page's /Rotate turns the content too, so a 45° mark on a /Rotate 90 page
  // displays at 135° unless the page angle is added back in. Without this a
  // diagonal watermark points opposite ways on rotated pages of one document.
  it("adds the page rotation so the mark's displayed angle is consistent", () => {
    const [mark] = planMarks({
      layoutId: "single",
      positionId: "center",
      markWidth: 200,
      markHeight: 30,
      markRotation: 45,
      box: A4,
      pageRotation: 90,
    });
    expect(mark.rotate).toBe(135);
  });

  // A page cropped once has a non-zero box origin. Dropping it puts the mark
  // outside the visible area — the same offset toPdfBox() and placeNumber()
  // preserve.
  it("adds the box origin", () => {
    const offset = { x: 50, y: 80, width: 400, height: 600 };
    const [centred] = planMarks({
      layoutId: "single",
      positionId: "center",
      markWidth: 100,
      markHeight: 20,
      box: offset,
    });
    // Unrotated, so the origin is the centre minus half the mark.
    expect(centred.x).toBeCloseTo(50 + 400 / 2 - 50);
    expect(centred.y).toBeCloseTo(80 + 600 / 2 - 10);
  });
});

// The assertions that matter, and the ones the per-position arithmetic cannot
// make on its own: they would check the maths against itself and pass just as
// happily with the mapping inverted. These apply the transform a *viewer*
// applies and check the mark lands where the user asked. This is the lesson from
// placeNumber(), where the 90 and 270 mappings were written backwards and every
// per-angle unit test still passed.
describe("planMarks round-trips through the viewer's rotation", () => {
  // How a PDF viewer maps unrotated user space onto the displayed page.
  function toDisplay(x, y, angle, width, height) {
    if (angle === 90) return { x: y, y: x, displayWidth: height, displayHeight: width };
    if (angle === 180)
      return { x: width - x, y: height - y, displayWidth: width, displayHeight: height };
    if (angle === 270)
      return { x: height - y, y: width - x, displayWidth: height, displayHeight: width };
    return { x, y, displayWidth: width, displayHeight: height };
  }

  // Where the mark's centre ends up after pdf-lib rotates it about the origin.
  function markCenter(mark, width, height) {
    const radians = (mark.rotate * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    return {
      x: mark.x + (width / 2) * cos - (height / 2) * sin,
      y: mark.y + (width / 2) * sin + (height / 2) * cos,
    };
  }

  const markWidth = 200;
  const markHeight = 30;

  for (const pageRotation of [0, 90, 180, 270]) {
    it(`centres a centred mark on the displayed page at ${pageRotation} degrees`, () => {
      const [mark] = planMarks({
        layoutId: "single",
        positionId: "center",
        markWidth,
        markHeight,
        markRotation: 45,
        box: A4,
        pageRotation,
      });

      const center = markCenter(mark, markWidth, markHeight);
      const shown = toDisplay(center.x, center.y, pageRotation, A4.width, A4.height);

      expect(shown.x).toBeCloseTo(shown.displayWidth / 2, 1);
      expect(shown.y).toBeCloseTo(shown.displayHeight / 2, 1);
    });

    it(`lands a bottom-left mark in the displayed bottom-left at ${pageRotation} degrees`, () => {
      const [mark] = planMarks({
        layoutId: "single",
        positionId: "bottom-left",
        markWidth,
        markHeight,
        // Unrotated, so the footprint is the mark itself and the expected
        // position is arithmetic the test can state independently.
        markRotation: 0,
        box: A4,
        pageRotation,
      });

      const center = markCenter(mark, markWidth, markHeight);
      const shown = toDisplay(center.x, center.y, pageRotation, A4.width, A4.height);

      const margin = Math.min(shown.displayWidth, shown.displayHeight) * 0.04;
      expect(shown.x).toBeCloseTo(margin + markWidth / 2, 1);
      expect(shown.y).toBeCloseTo(margin + markHeight / 2, 1);
    });

    it(`lands a top-right mark in the displayed top-right at ${pageRotation} degrees`, () => {
      const [mark] = planMarks({
        layoutId: "single",
        positionId: "top-right",
        markWidth,
        markHeight,
        markRotation: 0,
        box: A4,
        pageRotation,
      });

      const center = markCenter(mark, markWidth, markHeight);
      const shown = toDisplay(center.x, center.y, pageRotation, A4.width, A4.height);

      const margin = Math.min(shown.displayWidth, shown.displayHeight) * 0.04;
      expect(shown.x).toBeCloseTo(shown.displayWidth - margin - markWidth / 2, 1);
      expect(shown.y).toBeCloseTo(shown.displayHeight - margin - markHeight / 2, 1);
    });
  }

  // The mark must read at the same angle on screen regardless of how the page
  // itself is turned — otherwise one document's diagonal watermark points four
  // different ways.
  for (const pageRotation of [0, 90, 180, 270]) {
    it(`displays the mark at its chosen angle at page rotation ${pageRotation}`, () => {
      const [mark] = planMarks({
        layoutId: "single",
        positionId: "center",
        markWidth,
        markHeight,
        markRotation: 45,
        box: A4,
        pageRotation,
      });

      // A viewer subtracts the page's own rotation from the content's.
      const displayed = ((mark.rotate - pageRotation) % 360 + 360) % 360;
      expect(displayed).toBe(45);
    });
  }
});

describe("planMarks: single layout keeps the mark on the page", () => {
  it("keeps every position within the page bounds at every rotation", () => {
    for (const pageRotation of [0, 90, 180, 270]) {
      for (const position of POSITIONS) {
        for (const markRotation of [0, 45, 90, 315]) {
          const marks = planMarks({
            layoutId: "single",
            positionId: position.id,
            markWidth: 150,
            markHeight: 24,
            markRotation,
            box: A4,
            pageRotation,
          });

          const label = `${position.id} @ page ${pageRotation} / mark ${markRotation}`;
          expect(marks, label).toHaveLength(1);
          // Generous bounds: the origin of a rotated mark legitimately sits
          // outside the page (it's a corner of a shape whose centre is inside),
          // so this only catches a mark placed wholly off the sheet.
          expect(marks[0].x, label).toBeGreaterThan(-A4.width);
          expect(marks[0].x, label).toBeLessThan(A4.width * 2);
          expect(marks[0].y, label).toBeGreaterThan(-A4.height);
          expect(marks[0].y, label).toBeLessThan(A4.height * 2);
        }
      }
    }
  });

  // A mark bigger than the page can't be inset from a corner without being
  // pushed off the far edge, so it centres instead — it still covers the page,
  // which is what a watermark is for.
  it("centres a mark larger than the page rather than pushing it off", () => {
    const [corner] = planMarks({
      layoutId: "single",
      positionId: "bottom-left",
      markWidth: 2000,
      markHeight: 2000,
      box: A4,
    });
    const [centred] = planMarks({
      layoutId: "single",
      positionId: "center",
      markWidth: 2000,
      markHeight: 2000,
      box: A4,
    });
    expect(corner).toEqual(centred);
  });
});

describe("planMarks: tiled layout", () => {
  it("produces many marks", () => {
    const marks = planMarks({
      layoutId: "tile",
      markWidth: 120,
      markHeight: 20,
      markRotation: 45,
      densityId: "normal",
      box: A4,
    });
    expect(marks.length).toBeGreaterThan(4);
  });

  it("gets denser as the density preset tightens", () => {
    const counts = TILE_DENSITIES.map(
      (density) =>
        planMarks({
          layoutId: "tile",
          markWidth: 120,
          markHeight: 20,
          markRotation: 45,
          densityId: density.id,
          box: A4,
        }).length
    );
    // sparse < normal < dense
    expect(counts[0]).toBeLessThan(counts[1]);
    expect(counts[1]).toBeLessThan(counts[2]);
  });

  // The cap exists because each tile is a full draw operation: a few thousand
  // per page across a 200-page document takes minutes to save for a result
  // indistinguishable from a tenth as many.
  it("caps the tile count even for a tiny mark at the densest setting", () => {
    const marks = planMarks({
      layoutId: "tile",
      markWidth: 4,
      markHeight: 2,
      markRotation: 0,
      densityId: "dense",
      box: A4,
    });
    expect(marks.length).toBeLessThanOrEqual(MAX_TILES_PER_PAGE * 1.3);
  });

  // Capping by growing the step rather than truncating the grid — truncation
  // would cover part of the page and leave the rest bare, which reads as a
  // rendering bug rather than a sparser tiling.
  it("still covers the whole page when the cap bites", () => {
    const marks = planMarks({
      layoutId: "tile",
      markWidth: 4,
      markHeight: 2,
      markRotation: 0,
      densityId: "dense",
      box: A4,
    });

    const xs = marks.map((mark) => mark.x);
    const ys = marks.map((mark) => mark.y);

    // Marks reach into both halves of the page on both axes.
    expect(Math.min(...xs)).toBeLessThan(A4.width * 0.25);
    expect(Math.max(...xs)).toBeGreaterThan(A4.width * 0.75);
    expect(Math.min(...ys)).toBeLessThan(A4.height * 0.25);
    expect(Math.max(...ys)).toBeGreaterThan(A4.height * 0.75);
  });

  // A grid stopping at the page boundary leaves a visibly unmarked border, which
  // looks unfinished and hands anyone cropping the document a clean strip.
  it("extends the grid past the page edges", () => {
    const marks = planMarks({
      layoutId: "tile",
      markWidth: 100,
      markHeight: 20,
      markRotation: 0,
      densityId: "sparse",
      box: A4,
      pageRotation: 0,
    });

    const centers = marks.map((mark) => ({ x: mark.x + 50, y: mark.y + 10 }));
    expect(centers.some((center) => center.x < 0 || center.x > A4.width)).toBe(true);
    expect(centers.some((center) => center.y < 0 || center.y > A4.height)).toBe(true);
  });

  it("tiles a rotated page too, without collapsing to one mark", () => {
    for (const pageRotation of [0, 90, 180, 270]) {
      const marks = planMarks({
        layoutId: "tile",
        markWidth: 120,
        markHeight: 20,
        markRotation: 45,
        densityId: "normal",
        box: A4,
        pageRotation,
      });
      expect(marks.length, `page rotation ${pageRotation}`).toBeGreaterThan(4);
    }
  });

  // The same grid whichever way the page is turned: a quarter-turned page
  // presents the same displayed area, so the tile count should match.
  it("produces the same number of tiles at 0 and 180 degrees", () => {
    const at0 = planMarks({
      layoutId: "tile",
      markWidth: 120,
      markHeight: 20,
      markRotation: 45,
      densityId: "normal",
      box: A4,
      pageRotation: 0,
    });
    const at180 = planMarks({
      layoutId: "tile",
      markWidth: 120,
      markHeight: 20,
      markRotation: 45,
      densityId: "normal",
      box: A4,
      pageRotation: 180,
    });
    expect(at0).toHaveLength(at180.length);
  });

  it("never returns an unbounded grid for a degenerate footprint", () => {
    const marks = planMarks({
      layoutId: "tile",
      markWidth: 100,
      markHeight: 20,
      // A zero-scale footprint would divide by zero and loop forever.
      markRotation: 0,
      densityId: "normal",
      box: { x: 0, y: 0, width: 1, height: 1 },
    });
    expect(marks.length).toBeGreaterThan(0);
    expect(marks.length).toBeLessThanOrEqual(MAX_TILES_PER_PAGE * 1.3);
  });
});

describe("displayToUserSpace", () => {
  // Round-tripped rather than recomputed: a test that reapplies the same
  // arithmetic passes even when the mapping is inverted.
  function viewerTransform(x, y, angle, width, height) {
    if (angle === 90) return { x: y, y: x };
    if (angle === 180) return { x: width - x, y: height - y };
    if (angle === 270) return { x: height - y, y: width - x };
    return { x, y };
  }

  for (const angle of [0, 90, 180, 270]) {
    it(`inverts the viewer's transform at ${angle} degrees`, () => {
      const displayX = 120;
      const displayY = 300;

      const user = displayToUserSpace(displayX, displayY, angle, A4.width, A4.height);
      const back = viewerTransform(user.x, user.y, angle, A4.width, A4.height);

      expect(back.x).toBeCloseTo(displayX, 6);
      expect(back.y).toBeCloseTo(displayY, 6);
    });
  }
});

describe("validateWatermarkText", () => {
  it("accepts ordinary text", () => {
    expect(validateWatermarkText("CONFIDENTIAL")).toEqual({ ok: true, text: "CONFIDENTIAL" });
    expect(validateWatermarkText("  Draft copy  ")).toEqual({ ok: true, text: "Draft copy" });
  });

  it("rejects empty and whitespace-only text", () => {
    expect(validateWatermarkText("").ok).toBe(false);
    expect(validateWatermarkText("   ").ok).toBe(false);
    expect(validateWatermarkText(null).ok).toBe(false);
  });

  it("rejects text too long to fit legibly", () => {
    const result = validateWatermarkText("x".repeat(MAX_TEXT_LENGTH + 1));
    expect(result.ok).toBe(false);
    expect(result.error).toContain(String(MAX_TEXT_LENGTH));
  });

  it("accepts text at exactly the limit", () => {
    expect(validateWatermarkText("x".repeat(MAX_TEXT_LENGTH)).ok).toBe(true);
  });

  // The reason this validation exists at all. Unlike page numbers, this string
  // is user-supplied, and a character outside WinAnsi makes pdf-lib's
  // encodeText throw from deep inside the library with an unactionable message.
  it("rejects characters the standard font cannot draw", () => {
    const devanagari = validateWatermarkText("गोपनीय");
    expect(devanagari.ok).toBe(false);
    expect(devanagari.error).toContain("Latin letters");

    expect(validateWatermarkText("機密").ok).toBe(false);
    expect(validateWatermarkText("DRAFT 🔒").ok).toBe(false);
  });

  it("names the offending characters so the user can fix the text", () => {
    const result = validateWatermarkText("DRAFT 機");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("機");
  });
});

describe("findUnsupportedCharacters", () => {
  it("finds nothing in plain ASCII", () => {
    expect(findUnsupportedCharacters("DRAFT - copy 2 (v3)")).toEqual([]);
  });

  // CP-1252 is not simply Latin-1: it fills 0x80-0x9F with the typographic
  // characters a word processor substitutes automatically. Rejecting those
  // would refuse text that pastes in looking perfectly ordinary.
  it("accepts the curly quotes and dashes word processors substitute", () => {
    expect(findUnsupportedCharacters("‘quoted’")).toEqual([]);
    expect(findUnsupportedCharacters("“quoted”")).toEqual([]);
    expect(findUnsupportedCharacters("en–dash em—dash")).toEqual([]);
    expect(findUnsupportedCharacters("€100 … ™")).toEqual([]);
  });

  it("accepts Latin-1 accented characters", () => {
    expect(findUnsupportedCharacters("café naïve Ünger")).toEqual([]);
  });

  it("reports each offender only once", () => {
    expect(findUnsupportedCharacters("機機機")).toEqual(["機"]);
  });

  it("ignores whitespace control characters", () => {
    expect(findUnsupportedCharacters("a\tb\nc\rd")).toEqual([]);
  });

  it("survives non-string input", () => {
    expect(findUnsupportedCharacters(null)).toEqual([]);
    expect(findUnsupportedCharacters(undefined)).toEqual([]);
  });
});

describe("describeWatermark", () => {
  it("describes a tiled run", () => {
    expect(
      describeWatermark({ pageCount: 12, marksPerPage: 24, layoutId: "tile" })
    ).toBe("12 pages, tiled with about 24 marks per page.");
  });

  it("describes a single-mark run by position", () => {
    expect(
      describeWatermark({ pageCount: 1, marksPerPage: 1, layoutId: "single", positionId: "center" })
    ).toBe("1 page, one mark at centre.");
  });

  it("says so when nothing will be marked", () => {
    expect(describeWatermark({ pageCount: 0 })).toBe("No pages will be watermarked.");
  });
});
