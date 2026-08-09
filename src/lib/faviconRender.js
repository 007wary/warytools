// Geometry and text metrics for turning source art into a square icon.
//
// Pure functions, no canvas — same rule as imageWatermark.js. The drawing that
// consumes these lives in faviconDraw.js so it can be tested against a
// recording context stub.
//
// The problem this solves: a favicon is square and almost no source image is.
// Something has to decide what happens to the other axis, and the two sensible
// answers produce visibly different icons, so it's a user choice rather than a
// default buried in the code.

/**
 * Fits a source image into a square icon.
 *
 * @param {number} sourceWidth
 * @param {number} sourceHeight
 * @param {number} size          Icon edge length in pixels.
 * @param {object} [options]
 * @param {"contain"|"cover"} [options.fit]
 *   "contain" fits the whole image inside the square and leaves margin — right
 *   for a logo, where cropping the edge off a wordmark ruins it. "cover" fills
 *   the square and crops the overflow — right for a photo, where margin reads
 *   as a mistake.
 * @param {number} [options.padding]
 *   Fraction of the icon edge to leave empty on each side, 0 to 0.4. Artwork
 *   drawn edge-to-edge looks cramped in a browser tab and gets clipped by
 *   Android's adaptive-icon mask, which crops to a circle on many launchers.
 * @returns {{x: number, y: number, width: number, height: number}}
 *   The destination rect, in icon pixels. May sit outside the icon bounds
 *   under "cover" — that overflow is the crop, and the canvas clips it.
 */
export function fitRect(sourceWidth, sourceHeight, size, { fit = "contain", padding = 0 } = {}) {
  const safePadding = clampPadding(padding);

  // Guard against a zero-dimension source: a division by it yields Infinity,
  // and drawImage with a non-finite rect throws rather than drawing nothing,
  // taking the whole batch down over one broken file.
  if (!isPositive(sourceWidth) || !isPositive(sourceHeight) || !isPositive(size)) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const inset = size * safePadding;
  const box = size - inset * 2;

  const scale =
    fit === "cover"
      ? Math.max(box / sourceWidth, box / sourceHeight)
      : Math.min(box / sourceWidth, box / sourceHeight);

  const width = sourceWidth * scale;
  const height = sourceHeight * scale;

  // Centred on both axes. An off-centre icon is never what someone wants and
  // there's no control worth adding for it at 16px.
  return {
    x: (size - width) / 2,
    y: (size - height) / 2,
    width,
    height,
  };
}

/**
 * Font size for a text icon, as a fraction of the icon edge.
 *
 * Scaled by character count rather than fixed: one letter at 0.72 of the icon
 * fills it properly, and three letters at the same size run off both edges.
 * The whole point of the text mode is that it works without the user tuning
 * anything, so the sizing has to adapt on its own.
 *
 * @param {string} text
 * @param {number} size
 * @returns {number} Font size in pixels.
 */
export function textFontSize(text, size) {
  if (!isPositive(size)) return 0;

  const characters = [...String(text ?? "").trim()].length;
  if (characters === 0) return 0;

  if (characters === 1) return size * 0.68;
  if (characters === 2) return size * 0.5;
  return size * 0.36;
}

// A favicon is read at 16px, where fine strokes disappear into the tab's
// background and anything below roughly 4.5:1 contrast becomes a smudge. The
// text mode therefore picks the foreground itself from the chosen background
// rather than offering two colour pickers that can be set to navy on black.
const LIGHT_INK = "#ffffff";
const DARK_INK = "#111111";

/**
 * Picks black or white ink for a background colour.
 *
 * Uses relative luminance (WCAG's formula), not the average of the channels:
 * the eye is far more sensitive to green than to blue, so #0000ff averages
 * mid-grey while looking almost black, and an averaged decision puts dark text
 * on it.
 *
 * @param {string} hex `#rrggbb`, as produced by normaliseHexColor.
 * @returns {string} `#ffffff` or `#111111`.
 */
export function inkFor(hex) {
  const luminance = relativeLuminance(hex);
  if (luminance === null) return DARK_INK;

  // Contrast against white is (1.05 / (L + 0.05)); against black it's
  // ((L + 0.05) / 0.05). They cross at L ≈ 0.1791, so that's the threshold
  // that maximises contrast whichever side it falls.
  return luminance > 0.1791 ? DARK_INK : LIGHT_INK;
}

/**
 * WCAG relative luminance for a `#rgb`/`#rrggbb` colour.
 *
 * @returns {number|null} 0-1, or null if the colour can't be read.
 */
export function relativeLuminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;

  const [r, g, b] = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Corner radius in pixels for a rounded icon background.
 *
 * A fraction of the edge rather than a fixed pixel count, so the shape looks
 * the same at 16px and 512px. A fixed 8px radius is a subtle chamfer on a
 * 512 and swallows a 16 whole.
 */
export function cornerRadius(size, roundness = 0) {
  if (!isPositive(size)) return 0;
  // Capped at 0.5, where the square becomes a circle; past that the arcs
  // overlap and most renderers draw something malformed.
  const fraction = Math.min(0.5, Math.max(0, Number(roundness) || 0));
  return size * fraction;
}

/** Parses `#rgb`/`#rrggbb` to `[r, g, b]`, or null. */
export function hexToRgb(hex) {
  const text = String(hex ?? "").trim().replace(/^#/, "");

  if (!/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(text)) return null;

  const full =
    text.length === 3
      ? `${text[0]}${text[0]}${text[1]}${text[1]}${text[2]}${text[2]}`
      : text;

  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function clampPadding(padding) {
  const value = Number(padding);
  if (!Number.isFinite(value)) return 0;
  // Past 0.4 there is more margin than artwork and the icon reads as empty.
  return Math.min(0.4, Math.max(0, value));
}

function isPositive(value) {
  return Number.isFinite(value) && value > 0;
}
