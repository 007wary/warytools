import { describe, it, expect } from "vitest";
import {
  PAGE_SIZES,
  FIT_TO_IMAGE,
  MARGINS,
  findPageSize,
  marginPoints,
  layoutImagePage,
  describePageLayout,
} from "./pdfPageSizes";

describe("findPageSize", () => {
  it("finds a size by id", () => {
    expect(findPageSize("letter").label).toBe("US Letter");
  });

  it("falls back to A4 rather than returning undefined", () => {
    // Callers destructure the result immediately; undefined would throw at the
    // call site rather than producing a slightly wrong page.
    expect(findPageSize("b5").id).toBe("a4");
    expect(findPageSize(null).id).toBe("a4");
  });
});

describe("marginPoints", () => {
  it("resolves each preset", () => {
    expect(marginPoints("none")).toBe(0);
    expect(marginPoints("normal")).toBe(36);
    expect(marginPoints("large")).toBe(72);
  });

  it("treats an unknown margin as none", () => {
    expect(marginPoints("enormous")).toBe(0);
    expect(marginPoints(undefined)).toBe(0);
  });
});

describe("layoutImagePage", () => {
  it("centres a portrait image on a portrait page", () => {
    const layout = layoutImagePage({
      imageWidth: 1000,
      imageHeight: 1500,
      pageSizeId: "a4",
      orientation: "auto",
      marginId: "none",
    });

    expect(layout.pageWidth).toBeCloseTo(595.28, 1);
    expect(layout.pageHeight).toBeCloseTo(841.89, 1);
    // Fits by HEIGHT: the image is 1:1.5, taller per unit width than A4's
    // 1:1.414, so height is the binding constraint and width comes out short
    // of the page. 841.89 / 1.5 = 561.26.
    expect(layout.height).toBeCloseTo(841.89, 1);
    expect(layout.width).toBeCloseTo(561.26, 1);
    expect(layout.y).toBeCloseTo(0, 1);
    // Horizontally centred in the leftover space.
    expect(layout.x).toBeCloseTo((595.28 - layout.width) / 2, 1);
  });

  it("rotates the page to landscape for a landscape image on auto", () => {
    // The headline behaviour: without this a wide photo becomes a thin strip
    // marooned in the middle of a portrait sheet.
    const layout = layoutImagePage({
      imageWidth: 4000,
      imageHeight: 3000,
      pageSizeId: "a4",
      orientation: "auto",
      marginId: "none",
    });

    expect(layout.pageWidth).toBeGreaterThan(layout.pageHeight);
    expect(layout.pageWidth).toBeCloseTo(841.89, 1);
  });

  it("honours an explicit orientation over the image's shape", () => {
    const layout = layoutImagePage({
      imageWidth: 4000,
      imageHeight: 3000,
      pageSizeId: "a4",
      orientation: "portrait",
      marginId: "none",
    });

    expect(layout.pageHeight).toBeGreaterThan(layout.pageWidth);
  });

  it("preserves aspect ratio in every combination", () => {
    const sourceRatio = 1600 / 900;

    for (const pageSizeId of ["a4", "letter"]) {
      for (const orientation of ["auto", "portrait", "landscape"]) {
        for (const marginId of MARGINS.map((m) => m.id)) {
          const layout = layoutImagePage({
            imageWidth: 1600,
            imageHeight: 900,
            pageSizeId,
            orientation,
            marginId,
          });

          expect(layout.width / layout.height).toBeCloseTo(sourceRatio, 4);
        }
      }
    }
  });

  it("keeps the image inside the margins", () => {
    const layout = layoutImagePage({
      imageWidth: 1000,
      imageHeight: 1000,
      pageSizeId: "a4",
      orientation: "portrait",
      marginId: "large",
    });

    expect(layout.x).toBeGreaterThanOrEqual(72 - 0.001);
    expect(layout.y).toBeGreaterThanOrEqual(72 - 0.001);
    expect(layout.x + layout.width).toBeLessThanOrEqual(layout.pageWidth - 72 + 0.001);
    expect(layout.y + layout.height).toBeLessThanOrEqual(layout.pageHeight - 72 + 0.001);
  });

  it("makes the page match the image when fitting to image size", () => {
    const layout = layoutImagePage({
      imageWidth: 800,
      imageHeight: 600,
      pageSizeId: FIT_TO_IMAGE,
      marginId: "none",
    });

    expect(layout.pageWidth).toBe(800);
    expect(layout.pageHeight).toBe(600);
    expect(layout.width).toBe(800);
    expect(layout.height).toBe(600);
    expect(layout.x).toBe(0);
    expect(layout.y).toBe(0);
  });

  it("grows the page rather than cropping the image when fit-to-image has a margin", () => {
    // Honouring a margin by shrinking the image would silently discard pixels
    // the user never agreed to lose.
    const layout = layoutImagePage({
      imageWidth: 800,
      imageHeight: 600,
      pageSizeId: FIT_TO_IMAGE,
      marginId: "normal",
    });

    expect(layout.pageWidth).toBe(800 + 72);
    expect(layout.pageHeight).toBe(600 + 72);
    expect(layout.width).toBe(800);
    expect(layout.height).toBe(600);
  });

  it("never produces a non-positive box when margins swallow the page", () => {
    const layout = layoutImagePage({
      imageWidth: 100,
      imageHeight: 100,
      pageSizeId: "a4",
      orientation: "portrait",
      // 72pt each side is fine on A4, but the clamp is what stops a negative
      // content box producing an inverted draw rather than an error.
      marginId: "large",
    });

    expect(layout.width).toBeGreaterThan(0);
    expect(layout.height).toBeGreaterThan(0);
  });

  it("survives a zero or non-finite image dimension", () => {
    // A failed decode upstream must not write a NaN page box — pdf-lib would
    // emit a structurally invalid PDF rather than throwing.
    for (const bad of [0, -5, NaN, Infinity, undefined]) {
      const layout = layoutImagePage({
        imageWidth: bad,
        imageHeight: bad,
        pageSizeId: "a4",
      });

      expect(Number.isFinite(layout.pageWidth)).toBe(true);
      expect(Number.isFinite(layout.pageHeight)).toBe(true);
      expect(Number.isFinite(layout.width)).toBe(true);
      expect(Number.isFinite(layout.height)).toBe(true);
      expect(layout.width).toBeGreaterThan(0);
      expect(layout.height).toBeGreaterThan(0);
    }
  });

  it("defaults to A4 for an unknown page size", () => {
    const layout = layoutImagePage({ imageWidth: 100, imageHeight: 200, pageSizeId: "tabloid" });
    expect(layout.pageWidth).toBeCloseTo(PAGE_SIZES[0].width, 1);
  });
});

describe("describePageLayout", () => {
  it("names the size and orientation", () => {
    const layout = layoutImagePage({
      imageWidth: 100,
      imageHeight: 200,
      pageSizeId: "a4",
      orientation: "portrait",
    });

    expect(describePageLayout(layout, "a4")).toContain("A4 portrait");
    expect(describePageLayout(layout, "a4")).toContain("595 × 842 pt");
  });

  it("reports landscape when the page was flipped", () => {
    const layout = layoutImagePage({
      imageWidth: 400,
      imageHeight: 100,
      pageSizeId: "a4",
      orientation: "auto",
    });

    expect(describePageLayout(layout, "a4")).toContain("landscape");
  });

  it("says image size rather than naming a standard for fit-to-image", () => {
    const layout = layoutImagePage({
      imageWidth: 800,
      imageHeight: 600,
      pageSizeId: FIT_TO_IMAGE,
      marginId: "none",
    });

    expect(describePageLayout(layout, FIT_TO_IMAGE)).toContain("Image size");
  });

  it("returns an empty string for a missing layout", () => {
    expect(describePageLayout(null, "a4")).toBe("");
  });
});
