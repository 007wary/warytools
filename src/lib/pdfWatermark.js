// Watermark placement, sizing, and text validation for the Watermark PDF tool.
//
// Pure functions, no pdf-lib: everything here decides *what is drawn where*,
// which — as in pdfPageNumbers.js and cropGeometry.js — is the part that goes
// wrong without anything throwing. Per the repo convention, and because there is
// no component-level coverage, that logic lives here where it can be tested
// rather than inline in the client.
//
// Coordinates returned are PDF points in unrotated user space, ready for
// drawText/drawImage. The same two coordinate traps that placeNumber() and
// toPdfBox() exist for meet here as well, plus a third that is specific to
// rotated *content*: see rotatedFootprint().

/** How the mark repeats across the page. */
export const LAYOUTS = [
  {
    id: "single",
    label: "Single",
    hint: "One mark, positioned on the page",
  },
  {
    id: "tile",
    label: "Tiled",
    hint: "Repeated across the whole page",
  },
];

/**
 * Where a single (untiled) mark sits. Nine positions as a real 3×3 grid.
 *
 * Wider than pdfPageNumbers' six, because "centre" is the whole point of a
 * watermark — a DRAFT stamp belongs across the middle of the page, which is the
 * one position a page number never wants.
 */
export const POSITIONS = [
  { id: "center", label: "Centre", vertical: "middle", horizontal: "center" },
  { id: "top-left", label: "Top left", vertical: "top", horizontal: "left" },
  { id: "top-center", label: "Top centre", vertical: "top", horizontal: "center" },
  { id: "top-right", label: "Top right", vertical: "top", horizontal: "right" },
  { id: "middle-left", label: "Middle left", vertical: "middle", horizontal: "left" },
  { id: "middle-right", label: "Middle right", vertical: "middle", horizontal: "right" },
  { id: "bottom-left", label: "Bottom left", vertical: "bottom", horizontal: "left" },
  { id: "bottom-center", label: "Bottom centre", vertical: "bottom", horizontal: "center" },
  { id: "bottom-right", label: "Bottom right", vertical: "bottom", horizontal: "right" },
];

/**
 * Diagonal is the default, and deliberately so.
 *
 * A horizontal watermark reads as body content — people mistake it for part of
 * the document. The 45° convention exists because nothing in a real document is
 * set at an angle, so the mark is unmistakably an overlay.
 */
export const ROTATIONS = [
  { id: "diagonal", label: "Diagonal", degrees: 45 },
  { id: "horizontal", label: "Horizontal", degrees: 0 },
  { id: "vertical", label: "Vertical", degrees: 90 },
  { id: "reverse-diagonal", label: "Reverse diagonal", degrees: 315 },
];

/**
 * Opacity presets, as a list rather than a slider.
 *
 * Below about 0.05 the mark is invisible on screen and effectively absent from
 * a print; above ~0.6 it competes with the text underneath and makes the
 * document hard to read. Offering the useful band rather than 0-100 stops
 * someone shipping a document with an invisible or unreadable stamp.
 */
export const OPACITIES = [
  { id: "faint", label: "Faint", value: 0.08 },
  { id: "light", label: "Light", value: 0.15 },
  { id: "medium", label: "Medium", value: 0.25 },
  { id: "strong", label: "Strong", value: 0.4 },
];

/** Text sizes, relative to the page rather than absolute points — see resolveFontSize(). */
export const TEXT_SIZES = [
  { id: "small", label: "Small", scale: 0.05 },
  { id: "medium", label: "Medium", scale: 0.08 },
  { id: "large", label: "Large", scale: 0.12 },
];

/** Image widths, as a fraction of the page's shorter edge. */
export const IMAGE_SIZES = [
  { id: "small", label: "Small", scale: 0.2 },
  { id: "medium", label: "Medium", scale: 0.35 },
  { id: "large", label: "Large", scale: 0.55 },
];

/** Preset colours. Hex here, converted to pdf-lib's rgb() in the worker. */
export const COLORS = [
  { id: "grey", label: "Grey", hex: "#808080" },
  { id: "red", label: "Red", hex: "#d02020" },
  { id: "blue", label: "Blue", hex: "#2050c0" },
  { id: "black", label: "Black", hex: "#000000" },
];

/** How densely a tiled mark repeats. Gap is a multiple of the mark's own size. */
export const TILE_DENSITIES = [
  { id: "sparse", label: "Sparse", gap: 1.1 },
  { id: "normal", label: "Normal", gap: 0.6 },
  { id: "dense", label: "Dense", gap: 0.25 },
];

/**
 * The hard ceiling on tiles drawn per page.
 *
 * A dense tiling of a tiny mark on a large page is a combinatorial trap: each
 * tile is a full drawText or drawImage operation, and a few thousand of them per
 * page across a 200-page document produces a file that takes minutes to save and
 * megabytes to store, for a visual result indistinguishable from a tenth as
 * many. The cap is applied by clamping the *step*, not by truncating the grid —
 * truncating would leave part of the page unmarked, which looks like a bug.
 */
export const MAX_TILES_PER_PAGE = 400;

export const DEFAULT_SETTINGS = {
  mode: "text",
  text: "CONFIDENTIAL",
  layoutId: "tile",
  positionId: "center",
  rotationId: "diagonal",
  opacityId: "light",
  textSizeId: "medium",
  imageSizeId: "medium",
  colorId: "grey",
  densityId: "normal",
};

/** The longest watermark text accepted. Past this it cannot fit on a page legibly. */
export const MAX_TEXT_LENGTH = 60;

function findBy(list, id, fallbackIndex = 0) {
  return list.find((entry) => entry.id === id) || list[fallbackIndex];
}

export const findLayout = (id) => findBy(LAYOUTS, id, 1);
export const findPosition = (id) => findBy(POSITIONS, id);
export const findRotation = (id) => findBy(ROTATIONS, id);
export const findOpacity = (id) => findBy(OPACITIES, id, 1);
export const findTextSize = (id) => findBy(TEXT_SIZES, id, 1);
export const findImageSize = (id) => findBy(IMAGE_SIZES, id, 1);
export const findColor = (id) => findBy(COLORS, id);
export const findDensity = (id) => findBy(TILE_DENSITIES, id, 1);

/**
 * Converts a preset hex colour into the 0-1 components pdf-lib's rgb() wants.
 *
 * Its own function because pdf-lib takes 0-1 floats, not 0-255 bytes, and
 * passing bytes produces a *silently* clamped pure-white or pure-colour mark
 * rather than an error — the failure looks like a styling mistake, not a bug.
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

  if (!/^[0-9a-fA-F]{6}$/.test(full)) return { r: 0.5, g: 0.5, b: 0.5 };

  return {
    r: parseInt(full.slice(0, 2), 16) / 255,
    g: parseInt(full.slice(2, 4), 16) / 255,
    b: parseInt(full.slice(4, 6), 16) / 255,
  };
}

/**
 * Resolves a text-size preset against the page.
 *
 * Scaled to the page's *shorter* edge rather than being a fixed point size,
 * because a watermark is a proportion of the page by nature: 48pt reads as
 * "large" on A4 and as a caption on A0. Using the shorter edge specifically
 * means a landscape page and its portrait equivalent get the same mark, rather
 * than the landscape one getting a mark 40% bigger for no reason.
 *
 * @param {string} sizeId
 * @param {number} pageWidth  Displayed width, in points.
 * @param {number} pageHeight Displayed height, in points.
 * @returns {number} Font size in points.
 */
export function resolveFontSize(sizeId, pageWidth, pageHeight) {
  const { scale } = findTextSize(sizeId);
  const shortEdge = Math.min(pageWidth || 0, pageHeight || 0);
  if (!Number.isFinite(shortEdge) || shortEdge <= 0) return 24;
  // Floored at 8pt: a scaled-down mark on a very small page (a ticket, a label)
  // would otherwise be unreadable, and an illegible watermark protects nothing.
  return Math.max(8, shortEdge * scale);
}

/**
 * Resolves an image-size preset to a drawn width, preserving aspect ratio.
 *
 * @returns {{width: number, height: number}} In points.
 */
export function resolveImageSize(sizeId, imageWidth, imageHeight, pageWidth, pageHeight) {
  const { scale } = findImageSize(sizeId);
  const shortEdge = Math.min(pageWidth || 0, pageHeight || 0);

  if (!imageWidth || !imageHeight || shortEdge <= 0) {
    return { width: 0, height: 0 };
  }

  const width = shortEdge * scale;
  return { width, height: (width * imageHeight) / imageWidth };
}

/**
 * The axis-aligned bounding box of a rectangle rotated about its own centre.
 *
 * This is the third coordinate trap in this file, and the one unique to
 * watermarks. A 45° "CONFIDENTIAL" is far wider and taller than the text's own
 * width and height — a 300×20pt label rotated 45° occupies roughly 226×226pt.
 * Placing or tiling against the *unrotated* dimensions therefore lets a diagonal
 * mark run off the page edge, and makes tiles overlap each other at exactly the
 * angles where overlap is most visible. Nothing errors; the output simply looks
 * wrong in a way that is hard to attribute.
 *
 * @param {number} width
 * @param {number} height
 * @param {number} degrees
 * @returns {{width: number, height: number}} The footprint actually occupied.
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
 * Where drawText/drawImage's origin must go for a rotated mark to be *centred*
 * on a given point.
 *
 * pdf-lib rotates about the origin passed in — the bottom-left corner of the
 * mark — not about its centre. So asking for a 45° mark "at the centre of the
 * page" and passing the page centre as x/y swings the mark off up and to the
 * left, by an amount that grows with the mark's size. This solves the offset
 * back: rotate the vector from the mark's centre to its bottom-left corner by
 * the same angle, and add it to the desired centre point.
 *
 * @param {number} centerX Desired centre of the mark, in user space.
 * @param {number} centerY
 * @param {number} width   Unrotated mark width.
 * @param {number} height  Unrotated mark height.
 * @param {number} degrees Counter-clockwise, as pdf-lib applies it.
 * @returns {{x: number, y: number}} The origin to pass to pdf-lib.
 */
export function originForCenteredMark(centerX, centerY, width, height, degrees) {
  const radians = ((degrees || 0) * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  // Vector from the mark's centre to its own bottom-left corner, before rotation.
  const dx = -width / 2;
  const dy = -height / 2;

  return {
    x: centerX + dx * cos - dy * sin,
    y: centerY + dx * sin + dy * cos,
  };
}

/**
 * Maps a point from *displayed* space onto unrotated user space.
 *
 * The same mapping placeNumber() performs, extracted because tiling needs it per
 * tile rather than once. Both traps documented there apply: PDF's origin is
 * bottom-left, and a page's /Rotate means the frame the user sees is not the
 * frame the MediaBox describes.
 *
 * Input is bottom-left-origin *displayed* coordinates (y measured up from the
 * displayed bottom edge), which is what the placement maths below produces.
 *
 * @param {number} displayX
 * @param {number} displayY
 * @param {number} angle    Normalised /Rotate: 0, 90, 180, or 270.
 * @param {number} boxWidth  Unrotated box width.
 * @param {number} boxHeight Unrotated box height.
 * @returns {{x: number, y: number}}
 */
export function displayToUserSpace(displayX, displayY, angle, boxWidth, boxHeight) {
  if (angle === 90) {
    // A viewer maps user-space (x, y) to displayed (y, x), so the inverse swaps
    // the pair straight across — the displayed bottom edge is the unrotated LEFT.
    return { x: displayY, y: displayX };
  }
  if (angle === 180) {
    return { x: boxWidth - displayX, y: boxHeight - displayY };
  }
  if (angle === 270) {
    // At 270 the viewer maps (x, y) to (height - y, width - x); the inverse
    // mirrors both axes after the swap.
    return { x: boxWidth - displayY, y: boxHeight - displayX };
  }
  return { x: displayX, y: displayY };
}

/** Normalises a /Rotate value. Real files carry negatives and values above 360. */
export function normalizeAngle(rotation) {
  return (((Math.round((rotation || 0) / 90) * 90) % 360) + 360) % 360;
}

/**
 * Plans every mark to draw on one page.
 *
 * Returns a list of {x, y, rotate} origins in unrotated user space, one per
 * mark — a single-element list for the "single" layout, a grid for "tile". The
 * client and the worker both call this, so the preview and the output can't
 * disagree about placement.
 *
 * @param {object} params
 * @param {"single"|"tile"} params.layoutId
 * @param {string} params.positionId  Used only for the single layout.
 * @param {number} params.markWidth   Unrotated width of the mark, in points.
 * @param {number} params.markHeight  Unrotated height, in points.
 * @param {number} params.markRotation The mark's own angle, degrees CCW.
 * @param {string} params.densityId   Used only for the tile layout.
 * @param {{x: number, y: number, width: number, height: number}} params.box The page's CropBox.
 * @param {number} params.pageRotation The page's /Rotate.
 * @returns {{x: number, y: number, rotate: number}[]}
 */
export function planMarks({
  layoutId,
  positionId,
  markWidth,
  markHeight,
  markRotation = 0,
  densityId,
  box,
  pageRotation = 0,
}) {
  const boxX = box?.x || 0;
  const boxY = box?.y || 0;
  const boxWidth = box?.width || 0;
  const boxHeight = box?.height || 0;

  if (!(markWidth > 0) || !(markHeight > 0) || boxWidth <= 0 || boxHeight <= 0) return [];

  const angle = normalizeAngle(pageRotation);

  // The displayed frame. At 90/270 the axes swap, so a portrait MediaBox
  // presents as a landscape page and every placement below is relative to that.
  const quarterTurned = angle === 90 || angle === 270;
  const displayWidth = quarterTurned ? boxHeight : boxWidth;
  const displayHeight = quarterTurned ? boxWidth : boxHeight;

  // The mark's angle as the *viewer* will see it. The page's own /Rotate turns
  // the content too, so a 45° mark on a /Rotate 90 page would display at 135°
  // unless the page rotation is added back in here. Without this a diagonal
  // watermark points the opposite way on rotated pages of the same document.
  const drawAngle = (markRotation + angle) % 360;

  // The space the mark actually occupies once turned — see rotatedFootprint().
  const footprint = rotatedFootprint(markWidth, markHeight, markRotation);

  // Centres in displayed space, bottom-left origin.
  const centers =
    layoutId === "tile"
      ? tileCenters(displayWidth, displayHeight, footprint, densityId)
      : [singleCenter(positionId, displayWidth, displayHeight, footprint)];

  return centers.map((center) => {
    const userSpace = displayToUserSpace(center.x, center.y, angle, boxWidth, boxHeight);
    const origin = originForCenteredMark(
      // The box origin goes in last, as in placeNumber(): usually zero, but a
      // page cropped once carries a real offset and dropping it puts the mark
      // outside the visible area.
      boxX + userSpace.x,
      boxY + userSpace.y,
      markWidth,
      markHeight,
      drawAngle
    );

    return { x: origin.x, y: origin.y, rotate: drawAngle };
  });
}

/**
 * The centre point for a single mark, in displayed bottom-left-origin space.
 *
 * Insets by half the *rotated footprint* rather than half the raw mark, so a
 * diagonal mark in a corner sits fully on the page instead of hanging off it.
 */
function singleCenter(positionId, displayWidth, displayHeight, footprint) {
  const position = findPosition(positionId);

  // A small breathing margin so a corner mark isn't flush against the trim edge,
  // where many printers would clip it.
  const margin = Math.min(displayWidth, displayHeight) * 0.04;
  const halfWidth = footprint.width / 2;
  const halfHeight = footprint.height / 2;

  let x;
  if (position.horizontal === "left") {
    x = margin + halfWidth;
  } else if (position.horizontal === "right") {
    x = displayWidth - margin - halfWidth;
  } else {
    x = displayWidth / 2;
  }

  let y;
  if (position.vertical === "bottom") {
    y = margin + halfHeight;
  } else if (position.vertical === "top") {
    y = displayHeight - margin - halfHeight;
  } else {
    y = displayHeight / 2;
  }

  // A mark larger than the page would otherwise be pushed past the far edge by
  // the inset above; centring it is the honest fallback — it still covers the
  // page, which is what a watermark is for.
  if (footprint.width >= displayWidth) x = displayWidth / 2;
  if (footprint.height >= displayHeight) y = displayHeight / 2;

  return { x, y };
}

/**
 * Tile centres covering the whole displayed page, in bottom-left-origin space.
 *
 * The grid deliberately extends half a step *beyond* each edge. A grid that
 * stopped at the page boundary would leave a visibly unmarked border, which
 * both looks unfinished and hands anyone cropping the document a clean strip.
 * Tiles that fall partly outside are clipped by the page, which is correct.
 */
function tileCenters(displayWidth, displayHeight, footprint, densityId) {
  const { gap } = findDensity(densityId);

  let stepX = footprint.width * (1 + gap);
  let stepY = footprint.height * (1 + gap);

  // Degenerate footprints would divide by zero below and produce an unbounded
  // loop. Falling back to one tile is the safe reading.
  if (!(stepX > 0) || !(stepY > 0)) return [{ x: displayWidth / 2, y: displayHeight / 2 }];

  // The cap on total tiles is applied by growing the *step* until the count
  // fits, not by truncating the grid. Truncating would cover part of the page
  // and leave the rest bare, which reads as a rendering bug; a slightly sparser
  // tiling still covers everything and is visually near-identical.
  let columns = Math.ceil(displayWidth / stepX) + 1;
  let rows = Math.ceil(displayHeight / stepY) + 1;

  if (columns * rows > MAX_TILES_PER_PAGE) {
    const factor = Math.sqrt((columns * rows) / MAX_TILES_PER_PAGE);
    stepX *= factor;
    stepY *= factor;
    columns = Math.ceil(displayWidth / stepX) + 1;
    rows = Math.ceil(displayHeight / stepY) + 1;
  }

  // Centred on the page rather than anchored to a corner, so the pattern looks
  // deliberate and the same document tiles symmetrically at any page size.
  const originX = displayWidth / 2 - ((columns - 1) * stepX) / 2;
  const originY = displayHeight / 2 - ((rows - 1) * stepY) / 2;

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
 * Unlike page numbers — where the only glyphs are digits and the fixed words
 * "Page"/"of" — this string comes from the user, and that changes what can go
 * wrong. pdf-lib's standard fonts are WinAnsi-encoded, so a character outside
 * that set (any Devanagari, CJK, emoji, and the curly quotes and dashes that
 * word processors substitute automatically) makes encodeText throw from deep
 * inside the library with a message no user could act on.
 *
 * Catching it here means an actionable message instead. Embedding a Unicode
 * font would be the alternative, but it would add roughly a megabyte to every
 * output file to serve a case this tool's presets ("CONFIDENTIAL", "DRAFT",
 * "COPY") never hit.
 *
 * @param {string} value
 * @returns {{ok: true, text: string} | {ok: false, error: string}}
 */
export function validateWatermarkText(value) {
  const text = typeof value === "string" ? value.trim() : "";

  if (text === "") {
    return { ok: false, error: "Enter the text you want stamped across the pages." };
  }

  if (text.length > MAX_TEXT_LENGTH) {
    return {
      ok: false,
      error: `Watermark text can be at most ${MAX_TEXT_LENGTH} characters — longer than that won't fit legibly on a page.`,
    };
  }

  const unsupported = findUnsupportedCharacters(text);
  if (unsupported.length > 0) {
    return {
      ok: false,
      error: `The built-in watermark font can't draw ${unsupported.join(" ")} — please use Latin letters, digits, and basic punctuation.`,
    };
  }

  return { ok: true, text };
}

/**
 * The characters in a string that WinAnsi (CP-1252) cannot represent.
 *
 * Checked as a codepoint range rather than a regex of allowed characters,
 * because CP-1252 is not simply Latin-1: it fills the 0x80-0x9F control block
 * with typographic characters (curly quotes, en/em dashes, the euro sign), which
 * are exactly what a word processor produces from a straight quote or hyphen.
 * Rejecting those would refuse text that pastes in looking perfectly ordinary.
 *
 * @param {string} text
 * @returns {string[]} Distinct offending characters, for the error message.
 */
export function findUnsupportedCharacters(text) {
  // The codepoints CP-1252 maps into 0x80-0x9F. Everything else supported is
  // either ASCII or Latin-1's 0xA0-0xFF range.
  const cp1252Extras = new Set([
    0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039,
    0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122,
    0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
  ]);

  const offenders = new Set();

  for (const char of String(text || "")) {
    const code = char.codePointAt(0);

    // Tab, newline, and carriage return are representable but meaningless in a
    // single-line watermark, so they are not flagged — they're stripped by the
    // trim/normalise on the way in instead.
    if (code === 9 || code === 10 || code === 13) continue;

    const supported = (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || cp1252Extras.has(code);

    if (!supported) offenders.add(char);
  }

  return [...offenders];
}

/**
 * Describes what will happen, so the result is knowable before running.
 *
 * @param {object} params
 * @param {number} params.pageCount   Pages that will be marked.
 * @param {number} params.marksPerPage
 * @param {string} params.layoutId
 * @param {string} params.positionId
 * @returns {string}
 */
export function describeWatermark({ pageCount, marksPerPage, layoutId, positionId }) {
  if (!pageCount) return "No pages will be watermarked.";

  const pages = `${pageCount} page${pageCount === 1 ? "" : "s"}`;

  if (layoutId === "tile") {
    return `${pages}, tiled with about ${marksPerPage} mark${marksPerPage === 1 ? "" : "s"} per page.`;
  }

  return `${pages}, one mark at ${findPosition(positionId).label.toLowerCase()}.`;
}
