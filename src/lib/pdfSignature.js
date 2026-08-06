// Signature placement, sizing, and stroke-to-path conversion for Sign PDF.
//
// Pure functions, no pdf-lib and no canvas: everything here decides *what is
// drawn where*, which — as in pdfWatermark.js, pdfPageNumbers.js, and
// cropGeometry.js — is the part that goes wrong without anything throwing. Per
// the repo convention, and because there is no component-level coverage, that
// logic lives here where it can be tested rather than inline in the client.
//
// Two things make this file different from its siblings:
//
//   - **Placement is free, not a preset.** A watermark goes "centre" or "tiled";
//     a page number goes "bottom right". A signature goes on *the* line, which
//     is a specific spot in a specific document that no preset can name. So
//     placements are normalised 0-1 rects in DISPLAY space (the frame the user
//     drags in) and are converted to PDF user space by placementToPdfRect(),
//     which is where the usual coordinate traps live.
//   - **A document can carry several signatures**, on different pages — an
//     initial on each page plus a full signature and a date on the last one is
//     an ordinary request. So the unit of work is a list of placements, not one
//     set of settings applied everywhere.

/** How the signature was produced. Drives which controls the client shows. */
export const SOURCES = [
  { id: "draw", label: "Draw" },
  { id: "type", label: "Type" },
  { id: "upload", label: "Upload" },
];

/**
 * Typed-signature faces.
 *
 * These are the fonts pdf-lib can use without embedding anything — three of the
 * 14 standard PDF fonts. That constraint is the whole reason the list is short:
 * a real handwriting face would mean shipping and embedding a font file, adding
 * a few hundred KB to every signed document to serve an effect that is decorative
 * either way. The italic serif reads closest to a signature of what's available.
 *
 * `pdfFont` names the pdf-lib StandardFonts key; the worker resolves it, so this
 * module stays free of the pdf-lib import. `cssStack` is the preview's best
 * approximation — it will not match exactly, and the client says so.
 */
export const TYPE_FACES = [
  {
    id: "script",
    label: "Script",
    pdfFont: "TimesRomanItalic",
    cssStack: "'Segoe Script', 'Brush Script MT', 'Snell Roundhand', cursive",
  },
  {
    id: "serif",
    label: "Serif",
    pdfFont: "TimesRoman",
    cssStack: "'Times New Roman', Times, serif",
  },
  {
    id: "sans",
    label: "Sans",
    pdfFont: "Helvetica",
    cssStack: "Helvetica, Arial, sans-serif",
  },
];

/** Ink colours. Blue is offered because it's the convention for a wet signature. */
export const INK_COLORS = [
  { id: "black", label: "Black", hex: "#111111" },
  { id: "blue", label: "Blue", hex: "#12328c" },
];

/**
 * The default width of a placed signature, as a fraction of the page's width.
 *
 * A signature is sized relative to the page rather than in points for the same
 * reason a watermark is: 160pt is a signature on A4 and a monogram on A0. A
 * quarter of the page width is about what a signature occupies on a printed
 * contract line.
 */
export const DEFAULT_WIDTH_FRACTION = 0.25;

/** Bounds on the drag-resize, so a placement can't become invisible or absurd. */
export const MIN_WIDTH_FRACTION = 0.05;
export const MAX_WIDTH_FRACTION = 1;

/**
 * The pixel scale the drawn signature is captured at, relative to CSS pixels.
 *
 * This is the single most important number in the drawing path and the one that
 * decides whether the tool looks professional or looks like a fax. A signature
 * drawn on a ~600px-wide canvas and embedded at that resolution is roughly 90 DPI
 * once it lands at signature size on a page — visibly soft, and worse after
 * printing. Capturing at 3x means the embedded PNG has enough pixels to stay
 * crisp at print resolution, at a cost of a few tens of KB.
 *
 * It is NOT devicePixelRatio: that would make the same signature come out sharp
 * on a retina laptop and soft on an external monitor, which is a bug the user
 * cannot see and cannot explain.
 */
export const DRAW_CAPTURE_SCALE = 3;

/**
 * Stroke width for drawing, in CSS pixels before DRAW_CAPTURE_SCALE.
 *
 * Deliberately not a user control. Line weight relative to the drawn glyph size
 * is what makes a signature read as handwriting rather than as a marker doodle,
 * and it is not something anyone wants to tune — they want it to look right.
 */
export const DRAW_STROKE_WIDTH = 2.5;

/** The longest typed signature accepted. Past this it cannot fit legibly. */
export const MAX_TYPED_LENGTH = 40;

function findBy(list, id, fallbackIndex = 0) {
  return list.find((entry) => entry.id === id) || list[fallbackIndex];
}

export const findTypeFace = (id) => findBy(TYPE_FACES, id);
export const findInkColor = (id) => findBy(INK_COLORS, id);

/**
 * Converts a preset hex colour into the 0-1 components pdf-lib's rgb() wants.
 *
 * Same function and same reasoning as pdfWatermark's: pdf-lib takes 0-1 floats,
 * not 0-255 bytes, and passing bytes produces a silently clamped pure-colour
 * result rather than an error. Duplicated rather than imported so neither module
 * depends on the other — they are separate tools that happen to share a need.
 *
 * @param {string} hex
 * @returns {{r: number, g: number, b: number}}
 */
export function hexToRgb01(hex) {
  const text = String(hex || "").replace("#", "");
  const full =
    text.length === 3
      ? text
          .split("")
          .map((char) => char + char)
          .join("")
      : text;

  if (!/^[0-9a-fA-F]{6}$/.test(full)) return { r: 0, g: 0, b: 0 };

  return {
    r: parseInt(full.slice(0, 2), 16) / 255,
    g: parseInt(full.slice(2, 4), 16) / 255,
    b: parseInt(full.slice(4, 6), 16) / 255,
  };
}

/** Normalises a /Rotate value. Real files carry negatives and values above 360. */
export function normalizeAngle(rotation) {
  return (((Math.round((rotation || 0) / 90) * 90) % 360) + 360) % 360;
}

/**
 * The page's dimensions as the user sees them.
 *
 * At 90 and 270 the axes swap, so a portrait MediaBox presents as a landscape
 * page. Every placement below is expressed against this frame, because it is the
 * frame the user dragged in.
 *
 * @param {{width: number, height: number}} box
 * @param {number} rotation
 * @returns {{width: number, height: number}}
 */
export function displaySize(box, rotation) {
  const angle = normalizeAngle(rotation);
  const quarterTurned = angle === 90 || angle === 270;
  return {
    width: quarterTurned ? box?.height || 0 : box?.width || 0,
    height: quarterTurned ? box?.width || 0 : box?.height || 0,
  };
}

/**
 * Clamps a normalised placement rect to the page, preserving its aspect ratio.
 *
 * Width is the driven dimension and height follows from the signature's own
 * aspect — a signature stretched to fill a box is instantly recognisable as
 * wrong, so the height is never independently settable. That is why this takes
 * an `aspect` (width/height of the signature image itself) rather than a height.
 *
 * Note the aspect is applied in DISPLAY units, so the returned height fraction is
 * relative to the displayed page height. On a non-square page a 0.25 width and
 * the same signature give different height fractions on portrait and landscape,
 * which is correct: the signature is the same physical size either way.
 *
 * @param {{x: number, y: number, widthFraction: number}} placement
 * @param {number} aspect      Signature width / height, in its own pixels.
 * @param {number} pageWidth   Displayed page width, in points.
 * @param {number} pageHeight  Displayed page height, in points.
 * @returns {{x: number, y: number, width: number, height: number}} All 0-1, top-left origin.
 */
export function resolvePlacementRect(placement, aspect, pageWidth, pageHeight) {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;

  const widthFraction = clamp(
    Number.isFinite(placement?.widthFraction) ? placement.widthFraction : DEFAULT_WIDTH_FRACTION,
    MIN_WIDTH_FRACTION,
    MAX_WIDTH_FRACTION
  );

  // The height fraction has to go through points, not fractions: a signature
  // 0.25 of the way across a 595pt-wide page is 148.8pt wide, and how much of
  // the page's *height* that occupies depends on the page's height in points.
  // Computing it as widthFraction / aspect would be a fraction-of-width used as
  // a fraction-of-height, which is only correct on a square page — and is wrong
  // by the page's aspect ratio everywhere else, silently.
  const widthPoints = widthFraction * (pageWidth || 0);
  const heightPoints = widthPoints / safeAspect;
  const heightFraction = pageHeight > 0 ? heightPoints / pageHeight : 0;

  // Clamped so the box stays on the page. Position is nudged before size is
  // reduced: a signature dragged off the right edge should slide back on, not
  // shrink.
  const width = Math.min(widthFraction, 1);
  const height = Math.min(heightFraction, 1);

  const x = clamp(Number.isFinite(placement?.x) ? placement.x : 0, 0, Math.max(0, 1 - width));
  const y = clamp(Number.isFinite(placement?.y) ? placement.y : 0, 0, Math.max(0, 1 - height));

  return { x, y, width, height };
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

/**
 * Converts a normalised display-space rect into a PDF drawing rectangle.
 *
 * This is the function that decides whether the signature lands where the user
 * put it, and — exactly as in cropGeometry.toPdfBox() and pdfPageNumbers'
 * placeNumber() — both of the mismatches it resolves fail SILENTLY, producing
 * entirely valid-looking numbers that put the signature somewhere else:
 *
 *   - **PDF's origin is bottom-left with y increasing upward**, while the rect
 *     arriving here is top-left origin with y increasing downward (it came from
 *     a CSS-positioned drag layer). Get the flip wrong and a signature placed at
 *     the bottom of the page lands at the top — a mirror image that looks
 *     plausible in isolation and is only obviously wrong next to the original.
 *   - **The page's /Rotate means the frame the user dragged in is not the frame
 *     the MediaBox describes.** On a /Rotate 90 page the displayed bottom edge
 *     is one of the box's sides. Ignore it and the signature lands rotated a
 *     quarter turn along the page edge.
 *
 * Because both are silent, the tests for this function assert a ROUND TRIP
 * through the viewer's own transform rather than recomputing the arithmetic —
 * see pdfSignature.test.js. A test that recomputes the conversion passes just as
 * happily when the mapping is inverted, which is precisely how the 90°/270°
 * mappings in placeNumber() shipped backwards.
 *
 * @param {{x: number, y: number, width: number, height: number}} rect Normalised, top-left origin, display space.
 * @param {{x: number, y: number, width: number, height: number}} box  The page's CropBox, in points.
 * @param {number} rotation The page's /Rotate.
 * @returns {{x: number, y: number, width: number, height: number, rotate: number}}
 *   `x`/`y` are the origin to hand pdf-lib, `width`/`height` the drawn size in
 *   unrotated user space, and `rotate` the angle the content must be turned by.
 */
export function placementToPdfRect(rect, box, rotation = 0) {
  const boxX = box?.x || 0;
  const boxY = box?.y || 0;
  const boxWidth = box?.width || 0;
  const boxHeight = box?.height || 0;

  const angle = normalizeAngle(rotation);
  const quarterTurned = angle === 90 || angle === 270;

  const displayWidth = quarterTurned ? boxHeight : boxWidth;
  const displayHeight = quarterTurned ? boxWidth : boxHeight;

  // Step 1: the rect in displayed POINTS, still top-left origin.
  const displayX = (rect?.x || 0) * displayWidth;
  const displayTop = (rect?.y || 0) * displayHeight;
  const width = (rect?.width || 0) * displayWidth;
  const height = (rect?.height || 0) * displayHeight;

  // Step 2: flip to a bottom-left origin, still in displayed space. This is the
  // first trap: `displayTop` measures down from the top edge, and what follows
  // needs a distance up from the bottom edge — of the box's BOTTOM-left corner,
  // hence subtracting the height as well.
  const displayBottom = displayHeight - displayTop - height;

  // Step 3: map the bottom-left corner onto unrotated user space, and give the
  // content a matching rotation so it reads upright once the viewer applies
  // /Rotate. The mappings are the inverses of what a viewer does, identical to
  // pdfWatermark's displayToUserSpace().
  let x;
  let y;

  if (angle === 90) {
    // A viewer showing a /Rotate 90 page maps user-space (x, y) to displayed
    // (y, x), so inverting swaps the pair straight across — and the displayed
    // bottom edge is the unrotated LEFT edge.
    x = displayBottom;
    y = displayX;
  } else if (angle === 180) {
    // Both axes mirror. The far corner of the box becomes the near one, so the
    // width and height come off as well — without that the origin lands at the
    // rect's opposite corner and the signature is drawn off past the edge.
    x = boxWidth - displayX - width;
    y = boxHeight - displayBottom - height;
  } else if (angle === 270) {
    x = boxWidth - displayBottom - height;
    y = boxHeight - displayX - width;
  } else {
    x = displayX;
    y = displayBottom;
  }

  return {
    // The box origin goes on last. It is usually zero, but a page cropped once
    // carries a real offset, and dropping it puts the signature outside the
    // visible area — the same offset toPdfBox() and placeNumber() preserve.
    x: boxX + x,
    y: boxY + y,
    width,
    height,
    // pdf-lib rotates counter-clockwise about the origin passed in; /Rotate
    // turns the page clockwise. Turning the content by the same angle brings it
    // back upright relative to the page as displayed.
    rotate: angle,
  };
}

/**
 * Where pdf-lib's drawImage origin must go for a rotated placement.
 *
 * pdf-lib rotates about the origin, not about the drawn box's centre, so on a
 * rotated page the box swings away from where placementToPdfRect() computed its
 * corner. This walks the origin back so the rotated box occupies exactly the
 * intended rectangle.
 *
 * Kept separate from placementToPdfRect() so that function can be tested as a
 * pure display->user-space mapping without the pdf-lib drawing convention mixed
 * in.
 *
 * @param {{x: number, y: number, width: number, height: number, rotate: number}} pdfRect
 * @returns {{x: number, y: number}} The origin to pass to drawImage/drawText.
 */
export function drawOriginFor(pdfRect) {
  const { x, y, width, height, rotate } = pdfRect;
  const angle = normalizeAngle(rotate);

  // At each quarter turn the rotated box extends in a different direction from
  // its origin, so the origin moves to the corner the rotation sweeps away from.
  if (angle === 90) return { x: x + height, y };
  if (angle === 180) return { x: x + width, y: y + height };
  if (angle === 270) return { x, y: y + width };
  return { x, y };
}

/**
 * Turns captured pointer strokes into an SVG path.
 *
 * Used for the on-screen preview only — the embedded signature is a raster PNG
 * captured at DRAW_CAPTURE_SCALE. It lives here rather than in the component
 * because it is pure geometry with an easy failure mode: a path built by joining
 * raw points with straight lines looks like a seismograph, not handwriting.
 *
 * Points are joined with quadratic curves through their midpoints, which is the
 * standard cheap smoothing for freehand input: each segment's control point is
 * the sampled point itself, so the curve passes through the midpoints and the
 * corners are rounded off. Higher-order fitting buys nothing visible at
 * signature size.
 *
 * @param {{x: number, y: number}[]} points
 * @returns {string} An SVG path `d`, or "" for fewer than two points.
 */
export function strokeToPath(points) {
  if (!Array.isArray(points) || points.length === 0) return "";

  // A single point is a deliberate dot (someone tapping an i). Drawn as a
  // zero-length line, which a round linecap renders as a dot — omitting it
  // would silently drop taps.
  if (points.length === 1) {
    const [only] = points;
    return `M ${round(only.x)} ${round(only.y)} L ${round(only.x)} ${round(only.y)}`;
  }

  let path = `M ${round(points[0].x)} ${round(points[0].y)}`;

  for (let i = 1; i < points.length - 1; i++) {
    const current = points[i];
    const next = points[i + 1];
    const midX = (current.x + next.x) / 2;
    const midY = (current.y + next.y) / 2;
    path += ` Q ${round(current.x)} ${round(current.y)} ${round(midX)} ${round(midY)}`;
  }

  const last = points[points.length - 1];
  path += ` L ${round(last.x)} ${round(last.y)}`;

  return path;
}

function round(value) {
  return Math.round((value || 0) * 100) / 100;
}

/**
 * The bounding box of a set of strokes, padded by the stroke width.
 *
 * Cropping the captured canvas to this is what makes a drawn signature usable:
 * without it the exported image is the whole drawing pad, so a signature scrawled
 * in the middle of the pad embeds as a mostly-empty box, and the visible ink ends
 * up a fraction of the size the user asked for with no way to explain the
 * discrepancy.
 *
 * The padding matters because a stroke is centred on its path — half the line
 * weight falls outside the geometric bounds, and cropping to the raw bounds
 * shaves the outer edge off every stroke.
 *
 * @param {{x: number, y: number}[][]} strokes
 * @param {number} strokeWidth
 * @returns {{x: number, y: number, width: number, height: number} | null} Null when there is no ink.
 */
export function strokeBounds(strokes, strokeWidth = DRAW_STROKE_WIDTH) {
  const points = (strokes || []).flat();
  if (points.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const point of points) {
    if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) continue;
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;

  const pad = strokeWidth / 2 + 1;

  return {
    x: minX - pad,
    y: minY - pad,
    // A perfectly horizontal stroke has zero height, and a zero-dimension canvas
    // throws on getContext in some browsers and yields a blank image in others.
    // The padding already guarantees a positive size, but the max() states the
    // invariant rather than relying on it.
    width: Math.max(1, maxX - minX + pad * 2),
    height: Math.max(1, maxY - minY + pad * 2),
  };
}

/**
 * Validates a typed signature.
 *
 * Same WinAnsi constraint as the watermark text and for the same reason: pdf-lib's
 * standard fonts are WinAnsi-encoded, and a character outside that set makes
 * encodeText throw from deep inside the library with a message no user could act
 * on. Names are exactly where this bites — a name in Devanagari or CJK is an
 * entirely reasonable thing to type into a signature box.
 *
 * The error names the Draw tab as the way out, because for a name the font can't
 * set, drawing it is the answer rather than a different spelling.
 *
 * @param {string} value
 * @returns {{ok: true, text: string} | {ok: false, error: string}}
 */
export function validateTypedSignature(value) {
  const text = typeof value === "string" ? value.trim() : "";

  if (text === "") {
    return { ok: false, error: "Type the name you want to sign with." };
  }

  if (text.length > MAX_TYPED_LENGTH) {
    return {
      ok: false,
      error: `A typed signature can be at most ${MAX_TYPED_LENGTH} characters.`,
    };
  }

  const unsupported = findUnsupportedCharacters(text);
  if (unsupported.length > 0) {
    return {
      ok: false,
      error: `The built-in signature fonts can't draw ${unsupported.join(" ")} — use the Draw tab to sign in your own script instead.`,
    };
  }

  return { ok: true, text };
}

/**
 * The characters in a string that WinAnsi (CP-1252) cannot represent.
 *
 * Checked as a codepoint range rather than a regex of allowed characters, because
 * CP-1252 is not simply Latin-1: it fills the 0x80-0x9F control block with
 * typographic characters (curly quotes, en/em dashes), which are exactly what a
 * word processor or phone keyboard produces from a straight apostrophe. Rejecting
 * those would refuse a name like O'Brien pasted from anywhere.
 *
 * @param {string} text
 * @returns {string[]} Distinct offending characters, for the error message.
 */
export function findUnsupportedCharacters(text) {
  const cp1252Extras = new Set([
    0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039,
    0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122,
    0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
  ]);

  const offenders = new Set();

  for (const char of String(text || "")) {
    const code = char.codePointAt(0);
    if (code === 9 || code === 10 || code === 13) continue;

    const supported =
      (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || cp1252Extras.has(code);

    if (!supported) offenders.add(char);
  }

  return [...offenders];
}

/**
 * Describes the pending placements, so the result is knowable before running.
 *
 * @param {{pageIndex: number}[]} placements
 * @returns {string}
 */
export function describePlacements(placements) {
  if (!placements || placements.length === 0) {
    return "Place your signature on the page to continue.";
  }

  const pages = [...new Set(placements.map((placement) => placement.pageIndex + 1))].sort(
    (a, b) => a - b
  );

  const count = placements.length;
  const signatures = `${count} signature${count === 1 ? "" : "s"}`;

  if (pages.length === 1) return `${signatures} on page ${pages[0]}.`;

  return `${signatures} across pages ${pages.join(", ")}.`;
}
