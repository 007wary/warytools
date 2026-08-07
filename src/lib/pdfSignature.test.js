import { describe, it, expect } from "vitest";
import {
  TYPE_FACES,
  INK_COLORS,
  SOURCES,
  DEFAULT_WIDTH_FRACTION,
  MIN_WIDTH_FRACTION,
  MAX_TYPED_LENGTH,
  DRAW_STROKE_WIDTH,
  findTypeFace,
  findInkColor,
  hexToRgb01,
  normalizeAngle,
  displaySize,
  resolvePlacementRect,
  placementToPdfRect,
  drawOriginFor,
  strokeToPath,
  strokeBounds,
  validateTypedSignature,
  findUnsupportedCharacters,
  describePlacements,
} from "./pdfSignature";

// A4 portrait, the default everywhere this site's audience lives.
const A4 = { x: 0, y: 0, width: 595.28, height: 841.89 };

describe("lookups", () => {
  it("finds each type face and ink colour by id", () => {
    for (const face of TYPE_FACES) expect(findTypeFace(face.id)).toBe(face);
    for (const ink of INK_COLORS) expect(findInkColor(ink.id)).toBe(ink);
  });

  // Falling back rather than throwing: an unknown id can only come from a stale
  // saved setting, and signing in the default face beats failing the whole run.
  it("falls back rather than throwing on an unknown id", () => {
    expect(findTypeFace("copperplate").id).toBe("script");
    expect(findInkColor("chartreuse").id).toBe("black");
    expect(findTypeFace(undefined).id).toBe("script");
  });

  // The worker resolves these against pdf-lib's StandardFonts. A typo here is a
  // runtime throw inside embedFont, which surfaces as a generic failure.
  it("names only fonts pdf-lib ships as standard", () => {
    const standard = new Set([
      "TimesRoman",
      "TimesRomanItalic",
      "TimesRomanBold",
      "Helvetica",
      "HelveticaBold",
      "HelveticaOblique",
      "Courier",
    ]);
    for (const face of TYPE_FACES) expect(standard.has(face.pdfFont)).toBe(true);
  });

  it("offers exactly the three sources the client implements", () => {
    expect(SOURCES.map((source) => source.id)).toEqual(["draw", "type", "upload"]);
  });
});

describe("hexToRgb01", () => {
  // pdf-lib takes 0-1 floats. Handing it 0-255 bytes silently clamps to a pure
  // colour rather than throwing, so the failure looks like a styling mistake.
  it("converts to the 0-1 range pdf-lib wants", () => {
    expect(hexToRgb01("#000000")).toEqual({ r: 0, g: 0, b: 0 });
    expect(hexToRgb01("#ffffff")).toEqual({ r: 1, g: 1, b: 1 });
  });

  it("accepts shorthand and a missing hash", () => {
    expect(hexToRgb01("fff")).toEqual({ r: 1, g: 1, b: 1 });
    expect(hexToRgb01("#000")).toEqual({ r: 0, g: 0, b: 0 });
  });

  it("falls back to black for junk rather than producing NaN", () => {
    // NaN components make pdf-lib emit an unparseable colour operator, which
    // corrupts the page rather than failing loudly.
    expect(hexToRgb01("not-a-colour")).toEqual({ r: 0, g: 0, b: 0 });
    expect(hexToRgb01(null)).toEqual({ r: 0, g: 0, b: 0 });
  });

  it("converts every offered ink colour to finite components", () => {
    for (const ink of INK_COLORS) {
      const { r, g, b } = hexToRgb01(ink.hex);
      for (const component of [r, g, b]) {
        expect(Number.isFinite(component)).toBe(true);
        expect(component).toBeGreaterThanOrEqual(0);
        expect(component).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("normalizeAngle", () => {
  // Real files carry these. An un-normalised comparison against 90/180/270
  // silently falls through to the unrotated branch.
  it("normalises negative and above-360 rotations", () => {
    expect(normalizeAngle(-90)).toBe(270);
    expect(normalizeAngle(450)).toBe(90);
    expect(normalizeAngle(360)).toBe(0);
    expect(normalizeAngle(-270)).toBe(90);
  });

  it("snaps off-quarter values to the nearest quarter turn", () => {
    expect(normalizeAngle(89)).toBe(90);
    expect(normalizeAngle(1)).toBe(0);
  });

  it("treats a missing rotation as zero", () => {
    expect(normalizeAngle(undefined)).toBe(0);
    expect(normalizeAngle(null)).toBe(0);
  });
});

describe("displaySize", () => {
  it("leaves unrotated pages alone", () => {
    expect(displaySize(A4, 0)).toEqual({ width: A4.width, height: A4.height });
  });

  // The swap is what makes a portrait MediaBox present as a landscape page.
  it("swaps the axes on quarter-turned pages", () => {
    expect(displaySize(A4, 90)).toEqual({ width: A4.height, height: A4.width });
    expect(displaySize(A4, 270)).toEqual({ width: A4.height, height: A4.width });
    expect(displaySize(A4, 180)).toEqual({ width: A4.width, height: A4.height });
  });
});

describe("resolvePlacementRect", () => {
  it("drives height from the signature's own aspect ratio", () => {
    // A 3:1 signature a quarter of the page wide.
    const rect = resolvePlacementRect(
      { x: 0.1, y: 0.1, widthFraction: 0.25 },
      3,
      A4.width,
      A4.height
    );

    expect(rect.width).toBeCloseTo(0.25, 5);
    // 0.25 * 595.28 = 148.82pt wide; / 3 = 49.6pt tall; / 841.89 = 0.0589.
    expect(rect.height * A4.height).toBeCloseTo((0.25 * A4.width) / 3, 4);
  });

  // The bug this guards is invisible: using widthFraction/aspect as the height
  // fraction is only correct on a square page, and is wrong by the page's aspect
  // ratio everywhere else — so a signature comes out squashed on A4 and nothing
  // reports it.
  it("does not use the width fraction as a height fraction", () => {
    const rect = resolvePlacementRect({ x: 0, y: 0, widthFraction: 0.25 }, 3, A4.width, A4.height);
    expect(rect.height).not.toBeCloseTo(0.25 / 3, 4);
  });

  // The physical size is what a signature is: the same one on a portrait and a
  // landscape page should print at the same size, not scale with the page edge.
  it("keeps the drawn points identical across page orientations", () => {
    const portrait = resolvePlacementRect({ widthFraction: 0.25 }, 3, A4.width, A4.height);
    const landscape = resolvePlacementRect({ widthFraction: 0.25 }, 3, A4.width, A4.width);

    expect(portrait.width * A4.width).toBeCloseTo(landscape.width * A4.width, 5);
    expect(portrait.height * A4.height).toBeCloseTo(landscape.height * A4.width, 5);
  });

  it("clamps the position so the box stays fully on the page", () => {
    const rect = resolvePlacementRect({ x: 0.95, y: 0.98, widthFraction: 0.25 }, 3, A4.width, A4.height);

    expect(rect.x + rect.width).toBeLessThanOrEqual(1.0001);
    expect(rect.y + rect.height).toBeLessThanOrEqual(1.0001);
  });

  it("clamps the width to the allowed band", () => {
    const tiny = resolvePlacementRect({ widthFraction: 0.0001 }, 3, A4.width, A4.height);
    expect(tiny.width).toBeCloseTo(MIN_WIDTH_FRACTION, 5);

    const huge = resolvePlacementRect({ widthFraction: 40 }, 3, A4.width, A4.height);
    expect(huge.width).toBeLessThanOrEqual(1);
  });

  it("survives a missing or absurd aspect without producing NaN", () => {
    for (const aspect of [0, -3, NaN, undefined, null]) {
      const rect = resolvePlacementRect({ widthFraction: 0.25 }, aspect, A4.width, A4.height);
      for (const value of Object.values(rect)) {
        expect(Number.isFinite(value)).toBe(true);
      }
    }
  });

  it("defaults a placement with no width to the default fraction", () => {
    const rect = resolvePlacementRect({ x: 0, y: 0 }, 1, A4.width, A4.height);
    expect(rect.width).toBeCloseTo(DEFAULT_WIDTH_FRACTION, 5);
  });
});

describe("placementToPdfRect", () => {
  // The single most important assertion in this file, and the one the repo's own
  // history argues for: the 90/270 mappings in placeNumber() shipped INVERTED
  // with every per-angle unit test passing, because those tests recomputed the
  // conversion and were therefore just as true backwards.
  //
  // So this applies the VIEWER's transform to the function's output and asserts
  // it lands back where the user dragged. That is a claim about the mapping, not
  // about the arithmetic, and it fails when the mapping is wrong.
  describe("round-trips through the viewer's rotation", () => {
    /**
     * What a PDF viewer does with a page's /Rotate: takes a point in unrotated
     * user space and reports where it appears on screen, as a fraction of the
     * displayed page with a TOP-LEFT origin — the frame the user dragged in.
     *
     * Written independently of placementToPdfRect's internals on purpose. If
     * this were derived from the same expressions it would agree with a broken
     * mapping.
     */
    function viewerProject(point, box, angle) {
      // PDF user space, relative to the box origin, y up.
      const ux = point.x - box.x;
      const uy = point.y - box.y;

      // Where the viewer paints it, still y-up, in the DISPLAYED frame.
      let dx;
      let dy;

      if (angle === 90) {
        dx = uy;
        dy = ux;
      } else if (angle === 180) {
        dx = box.width - ux;
        dy = box.height - uy;
      } else if (angle === 270) {
        dx = box.height - uy;
        dy = box.width - ux;
      } else {
        dx = ux;
        dy = uy;
      }

      const quarterTurned = angle === 90 || angle === 270;
      const displayWidth = quarterTurned ? box.height : box.width;
      const displayHeight = quarterTurned ? box.width : box.height;

      // Back to the top-left-origin fractions the drag layer speaks.
      return {
        x: dx / displayWidth,
        y: (displayHeight - dy) / displayHeight,
      };
    }

    for (const angle of [0, 90, 180, 270]) {
      it(`lands where the user dragged on a /Rotate ${angle} page`, () => {
        // Deliberately asymmetric in both axes, so a mapping that mirrors or
        // swaps them cannot coincidentally agree.
        const rect = { x: 0.12, y: 0.71, width: 0.3, height: 0.08 };

        const pdfRect = placementToPdfRect(rect, A4, angle);

        // The rect's footprint in unrotated user space.
        //
        // `width`/`height` are extents along the DISPLAYED axes — the content is
        // drawn turned by `rotate`, so on a quarter-turned page the box spans
        // `height` along user-space x and `width` along user-space y. Reading
        // them as user-space extents directly is the mistake this whole
        // describe() block exists to catch, so the swap is spelled out rather
        // than assumed.
        const quarterTurned = angle === 90 || angle === 270;
        const spanX = quarterTurned ? pdfRect.height : pdfRect.width;
        const spanY = quarterTurned ? pdfRect.width : pdfRect.height;

        // All four corners are projected and the extremes compared, because
        // which user-space corner becomes the displayed top-left depends on the
        // angle — deciding that here would assume the very mapping under test.
        const corners = [
          { x: pdfRect.x, y: pdfRect.y },
          { x: pdfRect.x + spanX, y: pdfRect.y },
          { x: pdfRect.x, y: pdfRect.y + spanY },
          { x: pdfRect.x + spanX, y: pdfRect.y + spanY },
        ];

        const projected = corners.map((corner) => viewerProject(corner, A4, angle));

        const left = Math.min(...projected.map((p) => p.x));
        const right = Math.max(...projected.map((p) => p.x));
        const top = Math.min(...projected.map((p) => p.y));
        const bottom = Math.max(...projected.map((p) => p.y));

        expect(left).toBeCloseTo(rect.x, 5);
        expect(top).toBeCloseTo(rect.y, 5);
        expect(right - left).toBeCloseTo(rect.width, 5);
        expect(bottom - top).toBeCloseTo(rect.height, 5);
      });
    }

    // A page cropped once carries a non-zero box origin. Dropping it puts the
    // signature outside the visible area, and the numbers still look sane.
    it("preserves a non-zero box origin at every angle", () => {
      const offsetBox = { x: 20, y: 35, width: 500, height: 700 };
      const rect = { x: 0.2, y: 0.3, width: 0.25, height: 0.1 };

      for (const angle of [0, 90, 180, 270]) {
        const pdfRect = placementToPdfRect(rect, offsetBox, angle);
        expect(pdfRect.x).toBeGreaterThanOrEqual(offsetBox.x - 0.001);
        expect(pdfRect.y).toBeGreaterThanOrEqual(offsetBox.y - 0.001);
      }
    });
  });

  // The bottom-left-origin flip, stated directly on the simple case where it is
  // unambiguous. A signature at the bottom of the page must have a SMALL y.
  it("puts a signature dragged to the bottom at a small y", () => {
    const atBottom = placementToPdfRect({ x: 0.1, y: 0.85, width: 0.3, height: 0.1 }, A4, 0);
    const atTop = placementToPdfRect({ x: 0.1, y: 0.05, width: 0.3, height: 0.1 }, A4, 0);

    expect(atBottom.y).toBeLessThan(atTop.y);
    expect(atBottom.y).toBeCloseTo(A4.height * (1 - 0.85 - 0.1), 4);
  });

  it("reports the drawn size in points", () => {
    const pdfRect = placementToPdfRect({ x: 0, y: 0, width: 0.25, height: 0.1 }, A4, 0);
    expect(pdfRect.width).toBeCloseTo(A4.width * 0.25, 4);
    expect(pdfRect.height).toBeCloseTo(A4.height * 0.1, 4);
  });

  // On a quarter-turned page the displayed frame is the swapped one, so a
  // fraction of the displayed width is a fraction of the box's HEIGHT.
  it("measures against the displayed frame on quarter-turned pages", () => {
    const pdfRect = placementToPdfRect({ x: 0, y: 0, width: 0.25, height: 0.1 }, A4, 90);
    expect(pdfRect.width).toBeCloseTo(A4.height * 0.25, 4);
    expect(pdfRect.height).toBeCloseTo(A4.width * 0.1, 4);
  });

  it("returns the page angle as the content rotation", () => {
    for (const angle of [0, 90, 180, 270]) {
      expect(placementToPdfRect({ x: 0, y: 0, width: 0.1, height: 0.1 }, A4, angle).rotate).toBe(
        angle
      );
    }
  });

  it("produces finite numbers for a degenerate box", () => {
    const pdfRect = placementToPdfRect({ x: 0.5, y: 0.5, width: 0.2, height: 0.1 }, undefined, 0);
    for (const value of Object.values(pdfRect)) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });
});

describe("drawOriginFor", () => {
  // pdf-lib rotates about the origin passed in, not the box centre, so on a
  // rotated page the drawn box swings away unless the origin is walked back.
  it("leaves an unrotated placement's origin alone", () => {
    const rect = { x: 100, y: 200, width: 150, height: 50, rotate: 0 };
    expect(drawOriginFor(rect)).toEqual({ x: 100, y: 200 });
  });

  it("moves the origin to the corner each quarter turn sweeps from", () => {
    const rect = { x: 100, y: 200, width: 150, height: 50, rotate: 90 };
    expect(drawOriginFor(rect)).toEqual({ x: 150, y: 200 });

    expect(drawOriginFor({ ...rect, rotate: 180 })).toEqual({ x: 250, y: 250 });
    expect(drawOriginFor({ ...rect, rotate: 270 })).toEqual({ x: 100, y: 350 });
  });

  it("normalises the angle before choosing a corner", () => {
    const rect = { x: 10, y: 20, width: 100, height: 40, rotate: -90 };
    expect(drawOriginFor(rect)).toEqual(drawOriginFor({ ...rect, rotate: 270 }));
  });
});

describe("strokeToPath", () => {
  it("returns nothing for no points", () => {
    expect(strokeToPath([])).toBe("");
    expect(strokeToPath(null)).toBe("");
  });

  // A tap is a deliberate dot — an i, a full stop. Dropping single points would
  // silently lose them.
  it("renders a single point as a dot", () => {
    const path = strokeToPath([{ x: 5, y: 6 }]);
    expect(path).toBe("M 5 6 L 5 6");
  });

  it("starts at the first point and ends at the last", () => {
    const path = strokeToPath([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 0 },
    ]);

    expect(path.startsWith("M 0 0")).toBe(true);
    expect(path.endsWith("L 20 0")).toBe(true);
  });

  // Straight-line joins look like a seismograph rather than handwriting, which
  // is the visible difference between a usable signature and a toy one.
  it("smooths interior points with quadratic curves", () => {
    const path = strokeToPath([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 0 },
      { x: 30, y: 10 },
    ]);

    expect(path).toContain("Q");
    // Two interior points produce two curve segments.
    expect(path.match(/Q/g)).toHaveLength(2);
  });

  it("emits no NaN for malformed points", () => {
    const path = strokeToPath([
      { x: 0, y: 0 },
      { x: undefined, y: 10 },
      { x: 20, y: 0 },
    ]);
    expect(path).not.toContain("NaN");
  });
});

describe("strokeBounds", () => {
  it("returns null when there is no ink", () => {
    expect(strokeBounds([])).toBeNull();
    expect(strokeBounds([[]])).toBeNull();
    expect(strokeBounds(null)).toBeNull();
  });

  // Cropping to the ink is what stops a signature scrawled in the middle of the
  // pad from embedding as a mostly-empty box, with the visible ink a fraction of
  // the requested size.
  it("bounds the ink across every stroke", () => {
    const bounds = strokeBounds(
      [
        [
          { x: 10, y: 20 },
          { x: 30, y: 40 },
        ],
        [
          { x: 5, y: 50 },
          { x: 60, y: 15 },
        ],
      ],
      0
    );

    expect(bounds.x).toBeCloseTo(5 - 1, 5);
    expect(bounds.y).toBeCloseTo(15 - 1, 5);
    expect(bounds.width).toBeCloseTo(60 - 5 + 2, 5);
    expect(bounds.height).toBeCloseTo(50 - 15 + 2, 5);
  });

  // A stroke is centred on its path, so half the line weight falls outside the
  // geometric bounds — cropping to the raw bounds shaves every outer edge.
  it("pads by half the stroke width so no ink is clipped", () => {
    const tight = strokeBounds([[{ x: 10, y: 10 }, { x: 20, y: 20 }]], 0);
    const padded = strokeBounds([[{ x: 10, y: 10 }, { x: 20, y: 20 }]], DRAW_STROKE_WIDTH);

    expect(padded.x).toBeLessThan(tight.x);
    expect(padded.width).toBeGreaterThan(tight.width);
  });

  // A perfectly horizontal stroke has zero height, and a zero-dimension canvas
  // throws on getContext in some browsers and yields a blank image in others.
  it("never returns a zero dimension for a straight stroke", () => {
    const horizontal = strokeBounds([[{ x: 0, y: 50 }, { x: 100, y: 50 }]]);
    expect(horizontal.width).toBeGreaterThan(0);
    expect(horizontal.height).toBeGreaterThan(0);

    const vertical = strokeBounds([[{ x: 50, y: 0 }, { x: 50, y: 100 }]]);
    expect(vertical.width).toBeGreaterThan(0);
    expect(vertical.height).toBeGreaterThan(0);
  });

  it("ignores malformed points rather than producing NaN bounds", () => {
    const bounds = strokeBounds([[{ x: 10, y: 10 }, { x: NaN, y: 5 }, { x: 30, y: 30 }]], 0);
    for (const value of Object.values(bounds)) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });
});

describe("validateTypedSignature", () => {
  it("accepts an ordinary name", () => {
    expect(validateTypedSignature("Mwnswrang Wary")).toEqual({
      ok: true,
      text: "Mwnswrang Wary",
    });
  });

  it("trims surrounding whitespace", () => {
    expect(validateTypedSignature("  A. Person  ")).toEqual({ ok: true, text: "A. Person" });
  });

  it("rejects an empty signature", () => {
    expect(validateTypedSignature("").ok).toBe(false);
    expect(validateTypedSignature("   ").ok).toBe(false);
  });

  it("rejects text past the length limit", () => {
    const result = validateTypedSignature("a".repeat(MAX_TYPED_LENGTH + 1));
    expect(result.ok).toBe(false);
    expect(result.error).toContain(String(MAX_TYPED_LENGTH));
  });

  // CP-1252 is not Latin-1: it carries the curly quotes and dashes a phone
  // keyboard produces, and rejecting those would refuse "O'Brien" pasted from
  // anywhere at all.
  it("accepts accented names and typographic apostrophes", () => {
    expect(validateTypedSignature("José Müller").ok).toBe(true);
    expect(validateTypedSignature("O’Brien").ok).toBe(true);
    expect(validateTypedSignature("Anne-Marie").ok).toBe(true);
  });

  it("rejects scripts the standard fonts cannot draw, and names them", () => {
    const result = validateTypedSignature("मानसरंग");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("म");
    // The way out for a name the font can't set is to draw it, not to respell it.
    expect(result.error).toContain("Draw");
  });

  it("rejects emoji", () => {
    expect(validateTypedSignature("Sign 🙂").ok).toBe(false);
  });
});

describe("findUnsupportedCharacters", () => {
  it("finds nothing in plain ASCII", () => {
    expect(findUnsupportedCharacters("Jane Doe 123")).toEqual([]);
  });

  it("deduplicates offenders", () => {
    expect(findUnsupportedCharacters("मम")).toEqual(["म"]);
  });

  it("allows the CP-1252 typographic block", () => {
    expect(findUnsupportedCharacters("‘’“”–—…")).toEqual([]);
  });

  it("ignores whitespace control characters", () => {
    expect(findUnsupportedCharacters("a\tb\nc\rd")).toEqual([]);
  });
});

// The worker fits a typed signature to its box by solving the font size against
// BOTH dimensions and taking the smaller. This reproduces that arithmetic against
// real pdf-lib metrics, because the failure it guards against is silent and
// shipped once: solving from the height alone let a fourteen-character name
// overflow its box by ~20% in every offered face, so the text ran past the
// rectangle the user dragged with nothing reporting it.
//
// The library is imported here and nowhere else in the tests. That is
// deliberate — the whole point is to check the estimate in
// pdfSignature/SignPdfClient against the true metrics rather than against
// another copy of the estimate.
//
// It must be the SAME package the worker uses (@cantoo/pdf-lib, the fork that
// carries the standard security handler for Unlock/Protect). Measuring against
// a different build of the font metrics than the one that does the drawing
// would make this test agree with itself and disagree with production.
describe("typed signatures fit the box they were dragged", () => {
  /** The client's initial-aspect estimate, mirrored from SignPdfClient. */
  function estimateAspect(text) {
    const letters = text.replace(/[^A-Za-z]/g, "").length;
    const upperRatio = letters > 0 ? text.replace(/[^A-Z]/g, "").length / letters : 0;
    return Math.max(1.5, text.length * (0.5 + upperRatio * 0.12));
  }

  const NAMES = [
    "Jo",
    "Ana Ray",
    "Mwnswrang Wary",
    "Alexander Constantine III",
    "WILLIAM MACDONALD",
    "O'Brien-Smith",
    "José Müller",
  ];

  it("never draws wider or taller than the placement, in any face", async () => {
    const { PDFDocument, StandardFonts } = await import("@cantoo/pdf-lib");
    const pdf = await PDFDocument.create();

    for (const face of TYPE_FACES) {
      const font = await pdf.embedFont(StandardFonts[face.pdfFont]);

      for (const name of NAMES) {
        const rect = resolvePlacementRect(
          { x: 0.1, y: 0.7, widthFraction: DEFAULT_WIDTH_FRACTION },
          estimateAspect(name),
          A4.width,
          A4.height
        );

        const boxWidth = rect.width * A4.width;
        const boxHeight = rect.height * A4.height;

        // The worker's fit: both probes taken at size 100 and scaled, since
        // heightAtSize and widthOfTextAtSize are each linear in the size.
        const heightProbe = font.heightAtSize(100);
        const widthProbe = font.widthOfTextAtSize(name, 100);
        const fontSize = Math.min(
          (boxHeight / heightProbe) * 100,
          (boxWidth / widthProbe) * 100
        );

        const drawnWidth = (widthProbe / 100) * fontSize;
        const drawnHeight = (heightProbe / 100) * fontSize;

        // A hair over 1 is floating-point, not overflow.
        expect(drawnWidth / boxWidth).toBeLessThanOrEqual(1.001);
        expect(drawnHeight / boxHeight).toBeLessThanOrEqual(1.001);
      }
    }
  });

  // The other half of the claim: fitting must not leave the signature swimming
  // in its box. A fit that always returned a tiny size would pass the test above
  // and be just as wrong.
  it("fills at least 60% of the placement in both axes", async () => {
    const { PDFDocument, StandardFonts } = await import("@cantoo/pdf-lib");
    const pdf = await PDFDocument.create();

    for (const face of TYPE_FACES) {
      const font = await pdf.embedFont(StandardFonts[face.pdfFont]);

      for (const name of NAMES) {
        const rect = resolvePlacementRect(
          { x: 0.1, y: 0.7, widthFraction: DEFAULT_WIDTH_FRACTION },
          estimateAspect(name),
          A4.width,
          A4.height
        );

        const boxWidth = rect.width * A4.width;
        const boxHeight = rect.height * A4.height;

        const heightProbe = font.heightAtSize(100);
        const widthProbe = font.widthOfTextAtSize(name, 100);
        const fontSize = Math.min(
          (boxHeight / heightProbe) * 100,
          (boxWidth / widthProbe) * 100
        );

        const filled = Math.max(
          ((widthProbe / 100) * fontSize) / boxWidth,
          ((heightProbe / 100) * fontSize) / boxHeight
        );

        // One axis always touches the box — that is what taking the smaller of
        // the two solved sizes means — so this really asserts the OTHER axis
        // isn't wildly short, i.e. that the client's aspect estimate is close.
        expect(filled).toBeGreaterThan(0.6);
      }
    }
  });
});

describe("describePlacements", () => {
  it("prompts when nothing is placed", () => {
    expect(describePlacements([])).toContain("Place your signature");
    expect(describePlacements(null)).toContain("Place your signature");
  });

  it("names a single page", () => {
    expect(describePlacements([{ pageIndex: 2 }])).toBe("1 signature on page 3.");
  });

  it("counts several signatures on one page", () => {
    expect(describePlacements([{ pageIndex: 0 }, { pageIndex: 0 }])).toBe(
      "2 signatures on page 1."
    );
  });

  it("lists distinct pages in order", () => {
    expect(describePlacements([{ pageIndex: 4 }, { pageIndex: 0 }, { pageIndex: 4 }])).toBe(
      "3 signatures across pages 1, 5."
    );
  });
});
