// Page geometry for JPG to PDF.
//
// Pure functions, no pdf-lib — the fitting maths is the part that decides what
// the user actually gets on the page, and per the repo convention that means it
// belongs somewhere it can be tested rather than inline in a client component.
//
// All dimensions are PDF points (1/72 inch), which is pdf-lib's unit and the
// unit every page-size standard is defined in.

/**
 * Named page sizes, in points, portrait orientation.
 *
 * A4 first because it's the default everywhere outside North America and this
 * site's audience skews Indian (see the GST calculator's slabs). Letter is the
 * one alternative worth carrying; the long tail of B5/Legal/A3 adds a dropdown
 * entry each for a use case that barely exists in "turn my photos into a PDF".
 */
export const PAGE_SIZES = [
  { id: "a4", label: "A4", width: 595.28, height: 841.89, note: "210 × 297 mm" },
  { id: "letter", label: "US Letter", width: 612, height: 792, note: "8.5 × 11 in" },
];

/**
 * The "no page size at all" option: every page takes its image's dimensions.
 *
 * Kept as a distinct id rather than a magic null so the UI, the worker payload,
 * and these functions all name the same thing.
 */
export const FIT_TO_IMAGE = "image";

/** Margin presets, in points. 36pt = half an inch. */
export const MARGINS = [
  { id: "none", label: "None", points: 0 },
  { id: "small", label: "Small", points: 18 },
  { id: "normal", label: "Normal", points: 36 },
  { id: "large", label: "Large", points: 72 },
];

export const ORIENTATIONS = [
  { id: "auto", label: "Auto" },
  { id: "portrait", label: "Portrait" },
  { id: "landscape", label: "Landscape" },
];

/** Looks up a page size descriptor by id, falling back to A4. */
export function findPageSize(id) {
  return PAGE_SIZES.find((size) => size.id === id) || PAGE_SIZES[0];
}

/** Resolves a margin id to points. Unknown ids fall back to none, not a crash. */
export function marginPoints(id) {
  const found = MARGINS.find((margin) => margin.id === id);
  return found ? found.points : 0;
}

/**
 * Works out the page box and the image rectangle to draw inside it.
 *
 * Three things this handles that a naive implementation gets wrong:
 *
 *   - **Auto orientation** flips the page to match the image, so a landscape
 *     photo on A4 fills the page instead of sitting as a letterboxed strip in
 *     the middle of a portrait sheet. This is the single biggest visual
 *     difference between this and a one-line implementation.
 *   - **Margins that exceed the page** (a large margin on a small custom size)
 *     would produce a zero or negative content box, and pdf-lib would draw an
 *     inverted or invisible image rather than throwing. The content box is
 *     clamped to a positive minimum instead.
 *   - **Upscaling is allowed but never distorts.** The image is scaled by a
 *     single factor derived from the tighter of the two axes, so aspect ratio
 *     is preserved in every combination of inputs.
 *
 * @param {object} params
 * @param {number} params.imageWidth  Source pixel width.
 * @param {number} params.imageHeight Source pixel height.
 * @param {string} params.pageSizeId  A PAGE_SIZES id, or FIT_TO_IMAGE.
 * @param {string} params.orientation "auto" | "portrait" | "landscape".
 * @param {string} params.marginId    A MARGINS id.
 * @returns {{pageWidth: number, pageHeight: number, x: number, y: number, width: number, height: number}}
 */
export function layoutImagePage({
  imageWidth,
  imageHeight,
  pageSizeId = "a4",
  orientation = "auto",
  marginId = "normal",
}) {
  // A zero or non-finite dimension means a decode went wrong upstream. Falling
  // back to a square keeps the document generating rather than producing a NaN
  // page box, which pdf-lib writes out as a structurally invalid PDF.
  const safeWidth = Number.isFinite(imageWidth) && imageWidth > 0 ? imageWidth : 1;
  const safeHeight = Number.isFinite(imageHeight) && imageHeight > 0 ? imageHeight : 1;

  const margin = marginPoints(marginId);

  // Fit-to-image ignores orientation entirely: the page *is* the image, so
  // there's no spare space to orient. The margin still applies, growing the
  // page rather than shrinking the picture — cropping the image to honour a
  // margin would silently discard content the user never agreed to lose.
  if (pageSizeId === FIT_TO_IMAGE) {
    return {
      pageWidth: safeWidth + margin * 2,
      pageHeight: safeHeight + margin * 2,
      x: margin,
      y: margin,
      width: safeWidth,
      height: safeHeight,
    };
  }

  const size = findPageSize(pageSizeId);

  const wantsLandscape =
    orientation === "landscape" || (orientation === "auto" && safeWidth > safeHeight);

  const pageWidth = wantsLandscape ? size.height : size.width;
  const pageHeight = wantsLandscape ? size.width : size.height;

  // Clamped to a positive box. A 72pt margin on both sides of a small page can
  // consume the whole sheet, and a non-positive content box yields an inverted
  // draw rather than an error.
  const contentWidth = Math.max(1, pageWidth - margin * 2);
  const contentHeight = Math.max(1, pageHeight - margin * 2);

  // One scale factor from the tighter axis — this is what preserves the aspect
  // ratio. Scaling each axis independently to fill the box is the classic
  // stretched-photo bug.
  const scale = Math.min(contentWidth / safeWidth, contentHeight / safeHeight);

  const width = safeWidth * scale;
  const height = safeHeight * scale;

  return {
    pageWidth,
    pageHeight,
    // Centred in the content box, so uneven leftover space is split evenly
    // rather than pooling at one edge.
    x: (pageWidth - width) / 2,
    y: (pageHeight - height) / 2,
    width,
    height,
  };
}

/**
 * Describes a layout for the UI, so the user can see the result before running.
 *
 * @param {{pageWidth: number, pageHeight: number}} layout
 * @returns {string} e.g. "A4 portrait · 595 × 842 pt"
 */
export function describePageLayout(layout, pageSizeId) {
  if (!layout) return "";

  const orientationLabel = layout.pageWidth > layout.pageHeight ? "landscape" : "portrait";
  const dimensions = `${Math.round(layout.pageWidth)} × ${Math.round(layout.pageHeight)} pt`;

  if (pageSizeId === FIT_TO_IMAGE) return `Image size · ${dimensions}`;
  return `${findPageSize(pageSizeId).label} ${orientationLabel} · ${dimensions}`;
}
