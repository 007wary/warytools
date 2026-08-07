// Watermark placement, sizing, and text rules for the Watermark Image tool.
//
// Pure functions, no canvas: everything here decides *what is drawn where*,
// which — as in pdfWatermark.js, cropGeometry.js, and pdfPageNumbers.js — is
// the part that goes wrong without anything throwing. Per the repo convention,
// and because there is no component-level coverage, that logic lives here where
// it can be tested rather than inline in the client or the worker.
//
// ---------------------------------------------------------------------------
// Why this is a separate module from pdfWatermark.js, which does "the same job"
// ---------------------------------------------------------------------------
//
// It is deliberately NOT an import-and-adapt of the PDF version, and the reason
// is the one lesson pdfPageNumbers.js was written to record: the two live in
// opposite coordinate systems.
//
//   - PDF user space is bottom-left origin, y increasing upward, and a page
//     carries a /Rotate that means the frame the user sees is not the frame the
//     MediaBox describes. pdfWatermark.js exists mostly to survive those two.
//   - Canvas is top-left origin, y increasing downward, rotates clockwise for a
//     positive angle, and a bitmap has no rotation of its own — EXIF is already
//     resolved by createImageBitmap({ imageOrientation: "from-image" }) before
//     any of this runs.
//
// Sharing one module across both would mean a flag threaded through every
// function deciding which way "down" is, and a wrong flag produces *valid
// numbers* that mirror the output — the exact silent failure that the page
// numbers 90°/270° mapping shipped with and that every per-angle unit test
// still passed. Two modules that each know one convention cannot make that
// mistake. The presets and the tiling *strategy* are the shared ideas; the
// arithmetic is not, and pretending otherwise is what costs a day of debugging.
//
// Everything below is therefore in canvas space: origin top-left, y down,
// positive angles clockwise, and every dimension in output pixels.

/** How the mark repeats across the image. Mirrors the PDF tool's vocabulary. */
export const LAYOUTS = [
  {
    id: "single",
    label: "Single",
    hint: "One mark, positioned on the image",
  },
  {
    id: "tile",
    label: "Tiled",
    hint: "Repeated across the whole image",
  },
];

/**
 * Where a single (untiled) mark sits. A real 3×3 grid.
 *
 * The default is bottom-right rather than the PDF tool's centre, and the
 * difference is not arbitrary. A PDF watermark is a *security* stamp — DRAFT
 * across the middle, meant to be impossible to ignore. An image watermark is
 * overwhelmingly an attribution credit on a photo someone still wants to look
 * at, so the corner is the convention and the centre would ruin the picture.
 * Both are offered; only the default differs.
 */
export const POSITIONS = [
  { id: "bottom-right", label: "Bottom right", vertical: "bottom", horizontal: "right" },
  { id: "top-left", label: "Top left", vertical: "top", horizontal: "left" },
  { id: "top-center", label: "Top centre", vertical: "top", horizontal: "center" },
  { id: "top-right", label: "Top right", vertical: "top", horizontal: "right" },
  { id: "middle-left", label: "Middle left", vertical: "middle", horizontal: "left" },
  { id: "center", label: "Centre", vertical: "middle", horizontal: "center" },
  { id: "middle-right", label: "Middle right", vertical: "middle", horizontal: "right" },
  { id: "bottom-left", label: "Bottom left", vertical: "bottom", horizontal: "left" },
  { id: "bottom-center", label: "Bottom centre", vertical: "bottom", horizontal: "center" },
];

/**
 * Mark angles, in degrees clockwise — canvas's own direction.
 *
 * Horizontal is the default here, the reverse of the PDF tool, for the same
 * reason the default position differs: a credit line on a photo is read, so it
 * sits level. Diagonal is offered for the "SAMPLE across a proof" case, which
 * on an image is the minority use.
 */
export const ROTATIONS = [
  { id: "horizontal", label: "Horizontal", degrees: 0 },
  { id: "diagonal", label: "Diagonal", degrees: -45 },
  { id: "reverse-diagonal", label: "Reverse diagonal", degrees: 45 },
  { id: "vertical", label: "Vertical", degrees: -90 },
];

/**
 * Opacity presets.
 *
 * Deliberately a different band from pdfWatermark.js's 0.08-0.4, and copying
 * that band across would have been the single most visible mistake available
 * here. A PDF mark sits *underneath* body text that must stay readable, so it
 * has to be faint. An image mark sits *on top of a photo* and is usually a
 * visible credit or logo the owner wants seen — at 0.08 it is invisible, and
 * the user's reasonable conclusion is that the tool did nothing.
 *
 * The band still stops short of a hard 1.0 default: "Solid" is offered for
 * logos, but the default sits at 0.55 where a credit reads clearly without
 * obliterating the image under it.
 */
export const OPACITIES = [
  { id: "faint", label: "Faint", value: 0.2 },
  { id: "light", label: "Light", value: 0.35 },
  { id: "medium", label: "Medium", value: 0.55 },
  { id: "strong", label: "Strong", value: 0.75 },
  { id: "solid", label: "Solid", value: 1 },
];

/**
 * Text sizes, as a fraction of the image's shorter edge.
 *
 * Relative rather than a point size, and that is what makes a batch work at
 * all: this tool applies ONE settings object across images that may be 500px
 * and 6000px wide. A fixed 48px mark would be a banner across the first and a
 * speck on the second, and someone watermarking a folder of mixed exports would
 * have to run the tool once per size. Scaling to the *shorter* edge means a
 * landscape photo and its portrait crop get the same-looking mark.
 */
export const TEXT_SIZES = [
  { id: "small", label: "Small", scale: 0.03 },
  { id: "medium", label: "Medium", scale: 0.05 },
  { id: "large", label: "Large", scale: 0.08 },
  { id: "huge", label: "Huge", scale: 0.13 },
];

/** Logo widths, as a fraction of the image's shorter edge. */
export const IMAGE_SIZES = [
  { id: "small", label: "Small", scale: 0.15 },
  { id: "medium", label: "Medium", scale: 0.25 },
  { id: "large", label: "Large", scale: 0.4 },
  { id: "huge", label: "Huge", scale: 0.6 },
];

/**
 * Preset colours, plus the outline that makes them survive a real photograph.
 *
 * `outline` is not decoration. White text on a photo is invisible over a bright
 * sky and black text is invisible over a shadow — and a watermark tool whose
 * output disappears on half the user's images is broken in the way that gets
 * noticed only after the files are published. Every preset therefore carries a
 * contrasting stroke, which is what television captions and every photo-credit
 * convention do for exactly this reason.
 */
export const COLORS = [
  { id: "white", label: "White", hex: "#ffffff", outline: "#000000" },
  { id: "black", label: "Black", hex: "#000000", outline: "#ffffff" },
  { id: "grey", label: "Grey", hex: "#9aa0a6", outline: "#000000" },
  { id: "red", label: "Red", hex: "#e23b3b", outline: "#000000" },
  { id: "yellow", label: "Yellow", hex: "#f5c518", outline: "#000000" },
];

/** How densely a tiled mark repeats. Gap is a multiple of the mark's own size. */
export const TILE_DENSITIES = [
  { id: "sparse", label: "Sparse", gap: 1.1 },
  { id: "normal", label: "Normal", gap: 0.6 },
  { id: "dense", label: "Dense", gap: 0.25 },
];

/** Font stack for text marks. */
export const FONT_FAMILIES = [
  { id: "sans", label: "Sans", css: "sans-serif", bold: true },
  { id: "serif", label: "Serif", css: "serif", bold: true },
  { id: "mono", label: "Mono", css: "monospace", bold: true },
];

/**
 * The hard ceiling on tiles drawn per image.
 *
 * Lower than the PDF tool's 400 because the cost profile is different: there,
 * each tile is a drawText into a content stream and the expense is file size.
 * Here each tile is a canvas draw with a stroke, a fill, and a rotation — real
 * per-tile CPU, paid again for every image in the batch. Past a couple of
 * hundred the result is visually indistinguishable from half as many and the
 * batch takes twice as long.
 *
 * As in the PDF version, the cap is applied by growing the *step* rather than
 * truncating the grid — truncating leaves part of the image unmarked, which
 * reads as a rendering bug rather than a density setting.
 */
export const MAX_TILES_PER_IMAGE = 240;

/**
 * The smallest tile step treated as real, in pixels.
 *
 * Anything below this cannot draw a visible mark, and dividing it into an image
 * width produces an astronomically large grid — see tileCenters().
 */
export const MIN_TILE_STEP = 0.01;

/**
 * The longest watermark text accepted.
 *
 * Longer than the PDF tool's 60 because there is no WinAnsi ceiling here to
 * make long strings risky, but still bounded: past this a mark cannot fit on an
 * image legibly at any of the offered sizes, and the mark exists to be read.
 */
export const MAX_TEXT_LENGTH = 80;

/**
 * Margin from the edge for a single mark, as a fraction of the shorter edge.
 *
 * A corner credit flush against the edge looks like a mistake, and is the first
 * thing lost to a platform's own crop (an Instagram square, a Twitter preview).
 */
export const EDGE_MARGIN_SCALE = 0.03;

export const DEFAULT_SETTINGS = {
  mode: "text",
  text: "© Your Name",
  layoutId: "single",
  positionId: "bottom-right",
  rotationId: "horizontal",
  opacityId: "medium",
  textSizeId: "medium",
  imageSizeId: "medium",
  colorId: "white",
  fontId: "sans",
  densityId: "normal",
};

function findBy(list, id, fallbackIndex = 0) {
  return list.find((entry) => entry.id === id) || list[fallbackIndex];
}

export const findLayout = (id) => findBy(LAYOUTS, id);
export const findPosition = (id) => findBy(POSITIONS, id);
export const findRotation = (id) => findBy(ROTATIONS, id);
export const findOpacity = (id) => findBy(OPACITIES, id, 2);
export const findTextSize = (id) => findBy(TEXT_SIZES, id, 1);
export const findImageSize = (id) => findBy(IMAGE_SIZES, id, 1);
export const findColor = (id) => findBy(COLORS, id);
export const findFont = (id) => findBy(FONT_FAMILIES, id);
export const findDensity = (id) => findBy(TILE_DENSITIES, id, 1);

/**
 * Resolves a text-size preset against one image.
 *
 * Floored at 10px: a scaled mark on a thumbnail-sized source would otherwise be
 * unreadable, and an illegible watermark credits nobody.
 *
 * @param {string} sizeId
 * @param {number} width  Output width in pixels.
 * @param {number} height Output height in pixels.
 * @returns {number} Font size in pixels.
 */
export function resolveFontSize(sizeId, width, height) {
  const { scale } = findTextSize(sizeId);
  const shortEdge = Math.min(width || 0, height || 0);
  if (!Number.isFinite(shortEdge) || shortEdge <= 0) return 24;
  return Math.max(10, shortEdge * scale);
}

/**
 * Resolves a logo-size preset to a drawn box, preserving aspect ratio.
 *
 * @returns {{width: number, height: number}} In pixels.
 */
export function resolveLogoSize(sizeId, logoWidth, logoHeight, width, height) {
  const { scale } = findImageSize(sizeId);
  const shortEdge = Math.min(width || 0, height || 0);

  if (!(logoWidth > 0) || !(logoHeight > 0) || !(shortEdge > 0)) {
    return { width: 0, height: 0 };
  }

  const markWidth = shortEdge * scale;
  return { width: markWidth, height: (markWidth * logoHeight) / logoWidth };
}

/**
 * The axis-aligned bounding box of a rectangle rotated about its own centre.
 *
 * Identical maths to pdfWatermark's rotatedFootprint — the absolute values make
 * it direction-agnostic, so this one function is correct in both coordinate
 * systems. It is duplicated rather than imported to keep this module free of a
 * dependency on the PDF one; a visitor to an image tool should not pull the PDF
 * module into their bundle for four lines of trigonometry.
 *
 * Why it is needed at all: a 45° "© Photographer" is far wider and taller than
 * the text's own box. Placing or tiling against the *unrotated* dimensions lets
 * a diagonal mark hang off the edge and makes tiles overlap at exactly the
 * angles where overlap is most visible. Nothing errors; it just looks wrong.
 *
 * @param {number} width
 * @param {number} height
 * @param {number} degrees
 * @returns {{width: number, height: number}}
 */
export function rotatedFootprint(width, height, degrees) {
  const radians = ((degrees || 0) * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));

  return {
    width: Math.abs(width) * cos + Math.abs(height) * sin,
    height: Math.abs(width) * sin + Math.abs(height) * cos,
  };
}

/**
 * Plans every mark to draw on one image.
 *
 * Returns mark *centres* in canvas space (top-left origin, y down), one per
 * mark — a single-element list for the "single" layout, a grid for "tile".
 *
 * Returning centres rather than corner origins is the deliberate difference
 * from pdfWatermark.planMarks(), and it is what removes an entire class of bug
 * from this tool. pdf-lib rotates about the origin passed in, so the PDF module
 * needs originForCenteredMark() to walk the corner back around the rotation.
 * Canvas has translate() + rotate(), which rotates about whatever point you
 * translated to — so the drawing code translates to the centre, rotates, and
 * draws the mark centred on (0, 0). No corner arithmetic exists to get wrong.
 *
 * The client's preview and the worker both call this, so what is previewed and
 * what is exported cannot disagree about placement.
 *
 * @param {object} params
 * @param {"single"|"tile"} params.layoutId
 * @param {string} params.positionId  Used only for the single layout.
 * @param {number} params.markWidth   Unrotated width of the mark, in pixels.
 * @param {number} params.markHeight  Unrotated height, in pixels.
 * @param {number} params.rotation    The mark's angle, degrees clockwise.
 * @param {string} params.densityId   Used only for the tile layout.
 * @param {number} params.width       Image width in pixels.
 * @param {number} params.height      Image height in pixels.
 * @returns {{x: number, y: number}[]} Mark centres, canvas space.
 */
export function planMarks({
  layoutId,
  positionId,
  markWidth,
  markHeight,
  rotation = 0,
  densityId,
  width,
  height,
}) {
  if (!(markWidth > 0) || !(markHeight > 0) || !(width > 0) || !(height > 0)) return [];

  // The space the mark actually occupies once turned — see rotatedFootprint().
  const footprint = rotatedFootprint(markWidth, markHeight, rotation);

  if (layoutId === "tile") {
    return tileCenters(width, height, footprint, densityId);
  }

  return [singleCenter(positionId, width, height, footprint)];
}

/**
 * The centre point for a single mark, in canvas space.
 *
 * Insets by half the *rotated footprint* rather than half the raw mark, so a
 * diagonal mark in a corner sits fully on the image instead of hanging off it.
 */
function singleCenter(positionId, width, height, footprint) {
  const position = findPosition(positionId);

  const margin = Math.min(width, height) * EDGE_MARGIN_SCALE;
  const halfWidth = footprint.width / 2;
  const halfHeight = footprint.height / 2;

  let x;
  if (position.horizontal === "left") {
    x = margin + halfWidth;
  } else if (position.horizontal === "right") {
    x = width - margin - halfWidth;
  } else {
    x = width / 2;
  }

  // Canvas y grows downward, so "top" is the SMALL y — the inverse of the PDF
  // module's identical-looking function. This one line is the whole reason
  // these two files are not one file with a flag.
  let y;
  if (position.vertical === "top") {
    y = margin + halfHeight;
  } else if (position.vertical === "bottom") {
    y = height - margin - halfHeight;
  } else {
    y = height / 2;
  }

  // A mark wider than the image would be pushed off the far edge by the inset
  // above; centring it is the honest fallback — it still marks the image, which
  // is what was asked for.
  if (footprint.width >= width) x = width / 2;
  if (footprint.height >= height) y = height / 2;

  return { x, y };
}

/**
 * Tile centres covering the whole image, in canvas space.
 *
 * The grid deliberately extends half a step *beyond* each edge. A grid that
 * stopped at the boundary would leave a visibly unmarked border, which both
 * looks unfinished and hands anyone cropping the image a clean strip to take.
 * Tiles falling partly outside are clipped by the canvas, which is correct.
 */
function tileCenters(width, height, footprint, densityId) {
  const { gap } = findDensity(densityId);

  let stepX = footprint.width * (1 + gap);
  let stepY = footprint.height * (1 + gap);

  // A degenerate footprint falls back to a single centred mark.
  //
  // The guard is against a step too small to be *meaningful*, not merely
  // non-zero, and that distinction is the whole bug it was written for: a
  // `> 0` test passes for 1e-12, which then divides into the image width to
  // produce a grid of billions of tiles. It only looked safe because the cap
  // below appeared to catch it — and the cap, as originally written, didn't.
  // A step below a hundredth of a pixel cannot draw anything visible anyway.
  if (!(stepX > MIN_TILE_STEP) || !(stepY > MIN_TILE_STEP)) {
    return [{ x: width / 2, y: height / 2 }];
  }

  let columns = Math.ceil(width / stepX) + 1;
  let rows = Math.ceil(height / stepY) + 1;

  // The cap is applied by growing the step until the grid genuinely fits, in a
  // loop rather than a single scaling pass.
  //
  // One pass is not enough, which is a rounding trap rather than an obvious
  // one: the scale factor is computed against the exact tile count, but the new
  // count is re-derived through Math.ceil and a +1 overhang per axis, both of
  // which round *up*. On a 6000px image tiled with a 4px mark, one pass took
  // 6000 tiles to 276 — still over the 240 cap, and the original code returned
  // that number believing it had solved the problem. The loop is bounded by the
  // step growing strictly each iteration, and by a hard iteration limit so a
  // pathological input can never spin.
  for (let attempt = 0; attempt < 8 && columns * rows > MAX_TILES_PER_IMAGE; attempt++) {
    const factor = Math.sqrt((columns * rows) / MAX_TILES_PER_IMAGE);
    // Nudged past the exact factor so the ceilings above can't land the count
    // back on the same value and stall the loop making no progress.
    stepX *= factor * 1.02;
    stepY *= factor * 1.02;
    columns = Math.ceil(width / stepX) + 1;
    rows = Math.ceil(height / stepY) + 1;
  }

  // Centred on the image rather than anchored to a corner, so the pattern looks
  // deliberate and tiles symmetrically whatever the aspect ratio.
  const originX = width / 2 - ((columns - 1) * stepX) / 2;
  const originY = height / 2 - ((rows - 1) * stepY) / 2;

  const centers = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      centers.push({ x: originX + column * stepX, y: originY + row * stepY });
    }
  }

  return centers;
}

/**
 * Validates the watermark text.
 *
 * Note what is deliberately NOT checked here, unlike pdfWatermark's version:
 * the character set. That module rejects anything outside WinAnsi because
 * pdf-lib's standard fonts cannot encode it and throw from deep inside the
 * library. Canvas has no such limit — it draws whatever the system font can
 * render, so Devanagari, CJK, and emoji all work and refusing them would be an
 * invented restriction copied from a constraint that doesn't apply here.
 *
 * @param {string} value
 * @returns {{ok: true, text: string} | {ok: false, error: string}}
 */
export function validateWatermarkText(value) {
  // Newlines are collapsed rather than rejected: they arrive from pasted text
  // and a single-line mark is what every size preset is calibrated for.
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";

  if (text === "") {
    return { ok: false, error: "Enter the text you want stamped on your images." };
  }

  if (text.length > MAX_TEXT_LENGTH) {
    return {
      ok: false,
      error: `Watermark text can be at most ${MAX_TEXT_LENGTH} characters — longer than that won't fit legibly on an image.`,
    };
  }

  return { ok: true, text };
}

/**
 * The canvas `font` shorthand for a text mark.
 *
 * Built here rather than in the worker so the preview and the export are
 * guaranteed to request the same font. They render on different canvases (a DOM
 * one in the client, an OffscreenCanvas in the worker) and a mismatch in weight
 * or family would make the preview quietly lie about the result's width — which
 * is the number the whole placement is derived from.
 *
 * @param {string} fontId
 * @param {number} fontSize In pixels.
 * @returns {string}
 */
export function fontShorthand(fontId, fontSize) {
  const font = findFont(fontId);
  const size = Math.max(1, Math.round(fontSize || 0));
  return `${font.bold ? "bold " : ""}${size}px ${font.css}`;
}

/**
 * Stroke width for the text outline, relative to the font size.
 *
 * Proportional rather than a fixed pixel value: a 1px stroke that reads well
 * behind 16px text is invisible behind 200px text, and the size presets span
 * that whole range across a mixed batch.
 */
export function outlineWidth(fontSize) {
  return Math.max(1, (fontSize || 0) * 0.055);
}

/**
 * Describes what will happen, so the result is knowable before running.
 *
 * @param {object} params
 * @param {number} params.imageCount
 * @param {number} params.marksPerImage
 * @param {string} params.layoutId
 * @param {string} params.positionId
 * @returns {string}
 */
export function describeWatermark({ imageCount, marksPerImage, layoutId, positionId }) {
  if (!imageCount) return "No images will be watermarked.";

  const images = `${imageCount} image${imageCount === 1 ? "" : "s"}`;

  if (layoutId === "tile") {
    // "about", because the tile count is computed per image and a mixed batch
    // genuinely produces different counts — quoting the preview's number as
    // exact would be wrong for every image but the previewed one.
    return `${images}, tiled with about ${marksPerImage} mark${marksPerImage === 1 ? "" : "s"} each.`;
  }

  return `${images}, one mark at ${findPosition(positionId).label.toLowerCase()}.`;
}
