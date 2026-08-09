// DPI, scaling, and the pixel ceiling for PDF to JPG.
//
// A PDF page is measured in points (1/72 inch), so rendering at a chosen DPI is
// just `scale = dpi / 72`. The interesting part is the ceiling: canvas has a
// hard per-surface pixel limit, and past it browsers do not throw — they return
// a *blank* surface. A 300 DPI render of an A3 page is over 17 megapixels and
// lands on the wrong side of that line in Safari, so the user would download a
// zip of white images with no error anywhere.
//
// Everything here is pure so the clamping is testable; the actual rendering
// lives in the client, where pdf.js is.

import { MAX_CANVAS_PIXELS } from "./imageValidation";

/** PDF user-space units per inch. Fixed by the spec, not a preference. */
const POINTS_PER_INCH = 72;

/**
 * The DPI presets, named by what they're for rather than by number.
 *
 * Three, not a free-entry field: a custom DPI is only meaningful if you already
 * know your target, and the two failure modes it invites (an unusably huge
 * render, or a blurry one) are both silent. The pixel dimensions are shown live
 * next to each option instead, which answers the question people were actually
 * going to use a custom box for.
 */
export const DPI_PRESETS = [
  {
    id: "screen",
    dpi: 72,
    label: "Screen",
    note: "Smallest files. Fine for viewing on a phone or posting online.",
  },
  {
    id: "standard",
    dpi: 150,
    label: "Standard",
    note: "Sharp on screen and good enough to print. Best choice for most uses.",
  },
  {
    id: "print",
    dpi: 300,
    label: "Print",
    note: "Full print quality. Large files — a long document can run to tens of MB.",
  },
];

export const DEFAULT_DPI_PRESET = "standard";

/** Looks up a preset by id, falling back to the standard 150 DPI. */
export function findDpiPreset(id) {
  return (
    DPI_PRESETS.find((preset) => preset.id === id) ||
    DPI_PRESETS.find((preset) => preset.id === DEFAULT_DPI_PRESET)
  );
}

/**
 * Works out the render scale and output pixels for a page at a given DPI.
 *
 * Clamps to the canvas pixel ceiling and reports having done so, rather than
 * silently rendering blank. The caller surfaces `clamped` as a note — a user
 * who asked for 300 DPI and got 190 deserves to know why, especially since the
 * only fix available to them is to accept it.
 *
 * @param {number} pageWidth  Page width in points (pdf.js viewport at scale 1).
 * @param {number} pageHeight Page height in points.
 * @param {number} dpi        Requested dots per inch.
 * @returns {{scale: number, width: number, height: number, clamped: boolean, requestedDpi: number, effectiveDpi: number}}
 */
export function planPageRaster(pageWidth, pageHeight, dpi) {
  const safeWidth = Number.isFinite(pageWidth) && pageWidth > 0 ? pageWidth : 1;
  const safeHeight = Number.isFinite(pageHeight) && pageHeight > 0 ? pageHeight : 1;
  const safeDpi = Number.isFinite(dpi) && dpi > 0 ? dpi : 150;

  const requestedScale = safeDpi / POINTS_PER_INCH;
  const requestedPixels = safeWidth * requestedScale * safeHeight * requestedScale;

  if (requestedPixels <= MAX_CANVAS_PIXELS) {
    return {
      scale: requestedScale,
      // Floored, then floored to at least 1: a very small page at 72 DPI can
      // round to zero, and a zero-width canvas throws on render.
      width: Math.max(1, Math.floor(safeWidth * requestedScale)),
      height: Math.max(1, Math.floor(safeHeight * requestedScale)),
      clamped: false,
      requestedDpi: safeDpi,
      effectiveDpi: safeDpi,
    };
  }

  // Scale back so the area lands exactly on the ceiling. Area scales with the
  // square of the linear factor, hence the square root.
  const scale = Math.sqrt(MAX_CANVAS_PIXELS / (safeWidth * safeHeight));

  return {
    scale,
    width: Math.max(1, Math.floor(safeWidth * scale)),
    height: Math.max(1, Math.floor(safeHeight * scale)),
    clamped: true,
    requestedDpi: safeDpi,
    effectiveDpi: Math.floor(scale * POINTS_PER_INCH),
  };
}

/**
 * Formats the "what you'll get" line shown against a DPI option.
 *
 * @returns {string} e.g. "1240 × 1754 px"
 */
export function describeRasterSize(plan) {
  if (!plan) return "";
  return `${plan.width} × ${plan.height} px`;
}

/**
 * Warns when the ceiling forced a lower resolution than requested.
 *
 * @param {{clamped: boolean, requestedDpi: number, effectiveDpi: number}} plan
 * @returns {string} Empty when nothing was clamped.
 */
export function describeClamp(plan) {
  if (!plan?.clamped) return "";
  return `These pages are too large to render at ${plan.requestedDpi} DPI — browsers cap how many pixels a single image can hold. They'll be rendered at about ${plan.effectiveDpi} DPI instead, which is the most this device can produce in one pass.`;
}

/**
 * Names one exported page.
 *
 * Zero-padded to the document's width so a 120-page export sorts correctly in
 * a file manager. Without padding, "page-10.jpg" sorts before "page-2.jpg" and
 * the zip looks shuffled — a small thing that reads as a broken tool.
 *
 * `stem` is taken as already being a stem, and is NOT extension-stripped here.
 * It used to be, which silently truncated any filename carrying a dot in its
 * body: the caller strips ".pdf" and hands over "minutes.2024", this stripped
 * ".2024" as well, and every page of that document exported as "minutes-03.jpg".
 * Dotted names are ordinary (dates, version numbers), the loss is invisible
 * until someone looks for the file, and stripping twice can never be right —
 * whoever knows the real extension has already removed it.
 *
 * @param {string} stem      Source filename with its extension already removed.
 * @param {number} pageNumber 1-based.
 * @param {number} totalPages
 * @param {string} extension
 */
export function pageImageName(stem, pageNumber, totalPages, extension = "jpg") {
  const width = String(Math.max(1, totalPages)).length;
  const padded = String(pageNumber).padStart(width, "0");
  const safeStem = String(stem || "page").trim() || "page";
  return `${safeStem}-${padded}.${extension}`;
}

/**
 * The output formats offered for a rasterised page.
 *
 * JPG is the default and the tool's name, but PNG matters for pages that are
 * mostly text or line art, where JPG's block artefacts are visible around
 * glyph edges and PNG is often *smaller* as well as sharper.
 */
export const RASTER_FORMATS = [
  { mimeType: "image/jpeg", label: "JPG", extension: "jpg", note: "Best for pages with photos." },
  {
    mimeType: "image/png",
    label: "PNG",
    extension: "png",
    note: "Sharper on text and diagrams, and often smaller for them too.",
  },
];

/** Extension for a raster output type. */
export function rasterExtension(mimeType) {
  return RASTER_FORMATS.find((format) => format.mimeType === mimeType)?.extension || "jpg";
}
