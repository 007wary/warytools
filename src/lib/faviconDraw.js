// The one function that draws an icon, shared by the export path and the live
// preview.
//
// Same rule as imageWatermarkDraw.js, and for the same reason: two copies of
// drawing code drift, and a preview that disagrees with the downloaded file is
// the worst bug a preview can have — the user only finds out after they've
// published it. It is a separate module from faviconRender.js so it can be
// tested against a recording context stub, which is what catches ordering
// mistakes (clip after draw, fill before the transform) that pure geometry
// tests cannot see and that fail silently in the output.

import { fitRect, textFontSize, cornerRadius, inkFor } from "./faviconRender";

// A stack the system font would resolve differently on every OS is fine here:
// the glyph is rasterised to PNG on the user's machine, so what they see in the
// preview is exactly what ships. Named families first so the letterform is
// predictable where they exist.
const TEXT_FONT_STACK =
  '600 {size}px "Segoe UI", -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif';

/**
 * Draws one icon at one size.
 *
 * @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} ctx
 * @param {number} size Icon edge in pixels; the canvas is assumed square.
 * @param {object} settings
 * @param {"image"|"text"} settings.mode
 * @param {string} settings.background   `#rrggbb`, or "transparent".
 * @param {number} settings.roundness    0-0.5 of the edge.
 * @param {number} settings.padding      0-0.4 of the edge.
 * @param {"contain"|"cover"} settings.fit
 * @param {string} [settings.text]       Up to a few characters, text mode only.
 * @param {ImageBitmap|HTMLImageElement} [source] Decoded artwork, image mode only.
 */
export function drawIcon(ctx, size, settings, source = null) {
  const {
    mode = "image",
    background = "transparent",
    roundness = 0,
    padding = 0,
    fit = "contain",
    text = "",
  } = settings || {};

  // Every run starts from a known-empty surface. The preview canvas is reused
  // across setting changes, so without this a switch from an opaque background
  // to a transparent one would leave the old colour underneath — visible only
  // on transparent output, which is exactly where it would be missed.
  ctx.clearRect(0, 0, size, size);

  const hasBackground = background && background !== "transparent";

  // The rounded-rect path is used both to fill the background and to clip the
  // artwork, so a rounded icon crops its image to the same shape rather than
  // leaving square corners poking out past the background.
  const radius = cornerRadius(size, roundness);
  const rounded = radius > 0;

  if (hasBackground) {
    ctx.save();
    if (rounded) traceRoundedRect(ctx, 0, 0, size, size, radius);
    ctx.fillStyle = background;
    if (rounded) ctx.fill();
    else ctx.fillRect(0, 0, size, size);
    ctx.restore();
  }

  if (mode === "text") {
    drawText(ctx, size, text, hasBackground ? background : "#ffffff");
    return;
  }

  if (!source) return;

  const sourceWidth = source.width;
  const sourceHeight = source.height;
  const rect = fitRect(sourceWidth, sourceHeight, size, { fit, padding });

  // A zero-area rect means an unreadable source; drawImage would throw on the
  // non-finite scale rather than skip it, taking every other size down with it.
  if (rect.width <= 0 || rect.height <= 0) return;

  ctx.save();

  // Clip before drawing, not after — a clip applied afterwards affects nothing,
  // which is the silent-ordering failure the recording-context tests exist to
  // catch. Under "cover" the fitted rect deliberately overflows the square, and
  // this is what crops it; without the clip the overflow is still discarded by
  // the canvas bounds, but a rounded icon would keep its square corners.
  if (rounded) {
    traceRoundedRect(ctx, 0, 0, size, size, radius);
    ctx.clip();
  }

  // Only meaningful when downscaling, which is every case here.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  ctx.drawImage(source, rect.x, rect.y, rect.width, rect.height);
  ctx.restore();
}

/**
 * Draws the letter(s) for text mode, centred.
 *
 * Split out so the ordering rule below is stated once: the font must be set
 * BEFORE any measurement or centring, because a context measures in its
 * current font and the default is 10px sans-serif. Setting it afterwards
 * yields a correctly drawn glyph at the wrong position — valid-looking output,
 * silently misplaced, the same failure imageWatermarkDraw.js documents.
 */
function drawText(ctx, size, text, background) {
  const content = String(text ?? "").trim();
  if (content === "") return;

  const fontSize = textFontSize(content, size);
  if (fontSize <= 0) return;

  ctx.save();

  ctx.font = TEXT_FONT_STACK.replace("{size}", String(fontSize));
  ctx.fillStyle = inkFor(background);

  // Centring via the baseline attributes rather than by measuring: "middle"
  // uses the font's own em-box centre, which is stable across the font stack
  // above, whereas centring on measured glyph bounds shifts the letter
  // vertically depending on whether it has a descender ("J" vs "A").
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Nudged up by a fraction of the font size: "middle" centres the em box, but
  // the visual weight of capitals sits above it because the box reserves room
  // for descenders that a capital doesn't use. Without this a letter looks
  // low in the icon, most visibly at 16px.
  ctx.fillText(content, size / 2, size / 2 - fontSize * 0.02);

  ctx.restore();
}

/**
 * Traces a rounded rectangle as the current path.
 *
 * Hand-rolled rather than using ctx.roundRect(): that landed in Safari only in
 * 16.4, and this code runs in a preview on whatever browser the visitor has.
 * An undefined method on the context throws and would blank the whole tool for
 * those users, so the arcs are drawn explicitly.
 */
function traceRoundedRect(ctx, x, y, width, height, radius) {
  // Clamped so a radius past half the edge can't produce overlapping arcs,
  // which most renderers draw as a malformed shape rather than rejecting.
  const r = Math.min(radius, width / 2, height / 2);

  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.arcTo(x + width, y, x + width, y + r, r);
  ctx.lineTo(x + width, y + height - r);
  ctx.arcTo(x + width, y + height, x + width - r, y + height, r);
  ctx.lineTo(x + r, y + height);
  ctx.arcTo(x, y + height, x, y + height - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}
