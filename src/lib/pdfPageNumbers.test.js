import { describe, it, expect } from "vitest";
import {
  POSITIONS,
  FORMATS,
  MARGINS,
  findPosition,
  findFormat,
  marginPoints,
  formatPageLabel,
  planPageNumbers,
  placeNumber,
  describePlan,
  validateNumbering,
} from "./pdfPageNumbers";

// A4 portrait, the default everywhere this site's audience lives.
const A4 = { x: 0, y: 0, width: 595.28, height: 841.89 };

describe("lookups", () => {
  it("finds each position by id", () => {
    for (const position of POSITIONS) {
      expect(findPosition(position.id)).toBe(position);
    }
  });

  // Falling back rather than throwing: an unknown id can only come from a stale
  // saved setting, and stamping at the default beats failing the whole run.
  it("falls back to bottom centre for an unknown position", () => {
    expect(findPosition("nowhere").id).toBe("bottom-center");
    expect(findPosition(undefined).id).toBe("bottom-center");
  });

  it("falls back to the bare number for an unknown format", () => {
    expect(findFormat("elvish").id).toBe("plain");
  });

  it("resolves margin presets to points", () => {
    for (const margin of MARGINS) {
      expect(marginPoints(margin.id)).toBe(margin.points);
    }
    expect(marginPoints("enormous")).toBe(36);
  });
});

describe("formatPageLabel", () => {
  it("renders each offered format", () => {
    expect(formatPageLabel({ formatId: "plain", number: 7, total: 12 })).toBe("7");
    expect(formatPageLabel({ formatId: "page-n", number: 7, total: 12 })).toBe("Page 7");
    expect(formatPageLabel({ formatId: "n-of-total", number: 7, total: 12 })).toBe("7 / 12");
    expect(formatPageLabel({ formatId: "page-n-of-total", number: 7, total: 12 })).toBe(
      "Page 7 of 12"
    );
  });

  it("has a template for every offered format", () => {
    for (const format of FORMATS) {
      const label = formatPageLabel({ formatId: format.id, number: 3, total: 9 });
      expect(label).toBeTruthy();
      // An unsubstituted placeholder would print literally on the page.
      expect(label).not.toContain("{");
    }
  });
});

describe("planPageNumbers", () => {
  it("numbers every page by default", () => {
    const plan = planPageNumbers({ pageCount: 3, fromPage: 1, startNumber: 1 });
    expect(plan).toEqual([
      { index: 0, number: 1 },
      { index: 1, number: 2 },
      { index: 2, number: 3 },
    ]);
  });

  // The case a single "start at" control cannot express, and the most common
  // real request: don't stamp the cover, and call the page after it 1.
  it("skips leading pages while still starting the count at 1", () => {
    const plan = planPageNumbers({ pageCount: 4, fromPage: 3, startNumber: 1 });
    expect(plan).toEqual([
      { index: 2, number: 1 },
      { index: 3, number: 2 },
    ]);
  });

  // The other direction: the cover *is* page 1, it just wasn't stamped.
  it("can start the count above 1", () => {
    const plan = planPageNumbers({ pageCount: 4, fromPage: 3, startNumber: 3 });
    expect(plan).toEqual([
      { index: 2, number: 3 },
      { index: 3, number: 4 },
    ]);
  });

  it("clamps a start page beyond the document to the last page", () => {
    expect(planPageNumbers({ pageCount: 2, fromPage: 99 })).toEqual([{ index: 1, number: 1 }]);
  });

  it("clamps a start page below 1", () => {
    expect(planPageNumbers({ pageCount: 2, fromPage: 0 })).toHaveLength(2);
    expect(planPageNumbers({ pageCount: 2, fromPage: -5 })).toHaveLength(2);
  });

  it("returns nothing for a document with no pages", () => {
    expect(planPageNumbers({ pageCount: 0 })).toEqual([]);
    expect(planPageNumbers({ pageCount: NaN })).toEqual([]);
  });
});

describe("placeNumber on an unrotated page", () => {
  // The flip. PDF's origin is bottom-left with y increasing upward, so "bottom
  // of the page" is a SMALL y. Getting this backwards puts every number at the
  // opposite end of the sheet, and nothing errors.
  it("puts a bottom position near y=0, not near the page height", () => {
    const spot = placeNumber({
      positionId: "bottom-center",
      marginPoints: 36,
      textWidth: 10,
      fontSize: 12,
      box: A4,
    });
    expect(spot.y).toBe(36);
    expect(spot.y).toBeLessThan(A4.height / 2);
  });

  it("puts a top position near the page height", () => {
    const spot = placeNumber({
      positionId: "top-center",
      marginPoints: 36,
      textWidth: 10,
      fontSize: 12,
      box: A4,
    });
    expect(spot.y).toBeGreaterThan(A4.height / 2);
    // Margin measured to the top of the glyphs, not the baseline — otherwise a
    // top number hangs a line lower than a bottom one at the same margin.
    expect(spot.y).toBeCloseTo(A4.height - 36 - 12);
  });

  it("centres horizontally by subtracting half the text width", () => {
    const spot = placeNumber({ positionId: "bottom-center", textWidth: 20, box: A4 });
    expect(spot.x).toBeCloseTo((A4.width - 20) / 2);
  });

  it("right-aligns inside the margin, accounting for the text width", () => {
    const spot = placeNumber({
      positionId: "bottom-right",
      marginPoints: 36,
      textWidth: 20,
      box: A4,
    });
    expect(spot.x).toBeCloseTo(A4.width - 36 - 20);
    // The whole label must sit inside the margin, not overhang the page edge.
    expect(spot.x + 20).toBeLessThanOrEqual(A4.width - 36 + 0.001);
  });

  it("left-aligns at exactly the margin", () => {
    const spot = placeNumber({ positionId: "bottom-left", marginPoints: 36, box: A4 });
    expect(spot.x).toBe(36);
  });

  it("needs no text rotation on an unrotated page", () => {
    expect(placeNumber({ positionId: "bottom-center", box: A4 }).rotate).toBe(0);
  });
});

describe("placeNumber on a rotated page", () => {
  // The second silent failure, and the one that motivated this function existing
  // separately at all. On a /Rotate 90 page the displayed bottom edge is a SIDE
  // of the MediaBox. Ignore that and the number sits along the edge of the page,
  // turned a quarter turn — perfectly valid coordinates, completely wrong result.
  it("keeps the number on the displayed bottom edge at 90 degrees", () => {
    const spot = placeNumber({
      positionId: "bottom-center",
      marginPoints: 36,
      textWidth: 10,
      box: A4,
      rotation: 90,
    });
    // A viewer maps user-space (x, y) to displayed (y, x) at /Rotate 90, so the
    // displayed bottom edge is the unrotated LEFT edge — x sits at the margin.
    expect(spot.x).toBeCloseTo(36);
    expect(spot.rotate).toBe(90);
  });

  it("mirrors both axes at 180 degrees", () => {
    const spot = placeNumber({
      positionId: "bottom-center",
      marginPoints: 36,
      textWidth: 10,
      box: A4,
      rotation: 180,
    });
    // Displayed bottom at 180 is the unrotated TOP, so a small displayed y
    // becomes a large real y.
    expect(spot.y).toBeCloseTo(A4.height - 36);
    expect(spot.rotate).toBe(180);
  });

  it("maps the displayed bottom to the right edge at 270 degrees", () => {
    const spot = placeNumber({
      positionId: "bottom-center",
      marginPoints: 36,
      textWidth: 10,
      box: A4,
      rotation: 270,
    });
    expect(spot.x).toBeCloseTo(A4.width - 36);
    expect(spot.rotate).toBe(270);
  });

  // Real files carry these. An un-normalised angle falls through to the
  // unrotated branch and silently mis-places every number on the page.
  it("normalises negative and above-360 rotations", () => {
    const at90 = placeNumber({ positionId: "bottom-center", box: A4, rotation: 90 });
    expect(placeNumber({ positionId: "bottom-center", box: A4, rotation: -270 })).toEqual(at90);
    expect(placeNumber({ positionId: "bottom-center", box: A4, rotation: 450 })).toEqual(at90);
  });

  // A quarter-turned page presents landscape, so the margins apply to the other
  // pair of edges. Centring against the unswapped width would push the label
  // off a page whose displayed width is the MediaBox height.
  it("centres against the displayed width, not the raw box width", () => {
    const spot = placeNumber({
      positionId: "bottom-center",
      textWidth: 20,
      box: A4,
      rotation: 90,
    });
    // Displayed width is the box HEIGHT here, and the 90° swap sends the
    // centred offset onto y. Centring against A4.width instead would push the
    // label a quarter of a page off true centre.
    expect(spot.y).toBeCloseTo((A4.height - 20) / 2);
  });

  it("keeps every position inside the page at every rotation", () => {
    for (const rotation of [0, 90, 180, 270]) {
      for (const position of POSITIONS) {
        const spot = placeNumber({
          positionId: position.id,
          marginPoints: 36,
          textWidth: 40,
          fontSize: 12,
          box: A4,
          rotation,
        });
        expect(spot.x, `${position.id} at ${rotation}`).toBeGreaterThanOrEqual(0);
        expect(spot.y, `${position.id} at ${rotation}`).toBeGreaterThanOrEqual(0);
        expect(spot.x, `${position.id} at ${rotation}`).toBeLessThanOrEqual(A4.width);
        expect(spot.y, `${position.id} at ${rotation}`).toBeLessThanOrEqual(A4.height);
      }
    }
  });
});

// The assertion that actually matters, and the one the per-angle tests above
// cannot make on their own: they check the arithmetic against itself, so they
// pass just as happily when the mapping is inverted. This one applies the same
// transform a *viewer* applies and checks the label ends up where the user asked
// for it. The 90 and 270 mappings were initially written backwards and every
// unit test above still passed — this is what caught it.
describe("placeNumber round-trips through the viewer's rotation", () => {
  // How a PDF viewer maps unrotated user space onto the displayed page.
  function toDisplay(x, y, angle, width, height) {
    if (angle === 90) return { x: y, y: x, displayWidth: height, displayHeight: width };
    if (angle === 180)
      return { x: width - x, y: height - y, displayWidth: width, displayHeight: height };
    if (angle === 270)
      return { x: height - y, y: width - x, displayWidth: height, displayHeight: width };
    return { x, y, displayWidth: width, displayHeight: height };
  }

  const margin = 36;
  const textWidth = 60.9;
  const fontSize = 12;

  for (const rotation of [0, 90, 180, 270]) {
    it(`lands at the displayed bottom-centre at ${rotation} degrees`, () => {
      const spot = placeNumber({
        positionId: "bottom-center",
        marginPoints: margin,
        textWidth,
        fontSize,
        box: A4,
        rotation,
      });

      const shown = toDisplay(spot.x, spot.y, rotation, A4.width, A4.height);

      expect(shown.x).toBeCloseTo((shown.displayWidth - textWidth) / 2, 1);
      expect(shown.y).toBeCloseTo(margin, 1);
    });

    it(`lands at the displayed top-left at ${rotation} degrees`, () => {
      const spot = placeNumber({
        positionId: "top-left",
        marginPoints: margin,
        textWidth,
        fontSize,
        box: A4,
        rotation,
      });

      const shown = toDisplay(spot.x, spot.y, rotation, A4.width, A4.height);

      expect(shown.x).toBeCloseTo(margin, 1);
      expect(shown.y).toBeCloseTo(shown.displayHeight - margin - fontSize, 1);
    });
  }
});

describe("placeNumber on a previously cropped page", () => {
  // A page cropped once has a non-zero box origin. Dropping it puts the number
  // outside the visible area — the same offset toPdfBox() preserves for crops.
  it("adds the box origin", () => {
    const offset = { x: 50, y: 80, width: 400, height: 600 };
    const spot = placeNumber({
      positionId: "bottom-left",
      marginPoints: 36,
      box: offset,
    });
    expect(spot.x).toBe(50 + 36);
    expect(spot.y).toBe(80 + 36);
  });
});

describe("describePlan", () => {
  it("reads as the pages and the numbers they get", () => {
    const plan = planPageNumbers({ pageCount: 20, fromPage: 3, startNumber: 1 });
    expect(describePlan(plan, "bottom-center")).toBe(
      "Pages 3-20 numbered 1-18, bottom centre."
    );
  });

  it("uses the singular for a one-page plan", () => {
    const plan = planPageNumbers({ pageCount: 1 });
    expect(describePlan(plan, "top-right")).toContain("Page 1 numbered");
  });

  it("says so when nothing will be numbered", () => {
    expect(describePlan([], "bottom-center")).toBe("No pages will be numbered.");
    expect(describePlan(null, "bottom-center")).toBe("No pages will be numbered.");
  });
});

describe("validateNumbering", () => {
  it("accepts a valid pair", () => {
    expect(validateNumbering("3", "1", 20)).toEqual({ ok: true, fromPage: 3, startNumber: 1 });
  });

  // Number("") is 0, so an empty field must be caught as text before coercion —
  // otherwise a cleared box reads as a deliberate zero.
  it("rejects an empty field rather than reading it as zero", () => {
    expect(validateNumbering("", "1", 20).ok).toBe(false);
    expect(validateNumbering("3", "", 20).ok).toBe(false);
    expect(validateNumbering("   ", "1", 20).ok).toBe(false);
  });

  it("rejects non-integers", () => {
    expect(validateNumbering("2.5", "1", 20).ok).toBe(false);
    expect(validateNumbering("3", "abc", 20).ok).toBe(false);
  });

  // Infinity passes !isNaN, which is why the guard is Number.isInteger.
  it("rejects Infinity", () => {
    expect(validateNumbering("Infinity", "1", 20).ok).toBe(false);
    expect(validateNumbering("3", "Infinity", 20).ok).toBe(false);
  });

  it("rejects a start page outside the document", () => {
    const result = validateNumbering("21", "1", 20);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("between 1 and 20");
    expect(validateNumbering("0", "1", 20).ok).toBe(false);
  });

  it("rejects a first number below 1 rather than silently clamping it", () => {
    expect(validateNumbering("1", "0", 20).ok).toBe(false);
    expect(validateNumbering("1", "-3", 20).ok).toBe(false);
  });
});
