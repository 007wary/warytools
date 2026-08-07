// The canvas drawing routine for the image watermark, shared by the worker and
// the client's live preview.
//
// This exists as its own module for two reasons, and the second is the one that
// matters.
//
// 1. The worker draws on an OffscreenCanvas and the preview draws on a DOM
//    canvas. Both take the same 2D context API, so one function serves both —
//    and a shared function is the only way the preview can be guaranteed not to
//    lie about what the export will look like. Two hand-kept-in-sync copies
//    drift, and the drift shows up as "the preview looked different", which is
//    the single most damaging bug a preview can have.
//
// 2. It can be TESTED. Everything here is calls against a context object, so a
//    recording stub verifies the call sequence without a real canvas. That
//    matters because the ordering rules below — stroke before fill, translate
//    before rotate, baseline set before any text — are all silent when wrong:
//    the output is a plausible-looking image with thin letters, marks swung off
//    their anchor, or text sitting above its intended point. Per the repo
//    convention, logic that fails silently belongs where a test can reach it.
//
// Geometry decisions all come from imageWatermark.js; this module only performs
// them.

import {
  planMarks,
  resolveFontSize,
  resolveLogoSize,
  findRotation,
  findOpacity,
  findColor,
  fontShorthand,
  outlineWidth,
} from "./imageWatermark";

/**
 * Stamps the watermark onto a canvas context.
 *
 * Everything is measured against the dimensions passed in, which must be the
 * OUTPUT size — so a resize-then-watermark run marks the file the user gets
 * rather than one sized against the source.
 *
 * @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} ctx
 * @param {number} width  Output width in pixels.
 * @param {number} height Output height in pixels.
 * @param {object} settings See DEFAULT_SETTINGS in imageWatermark.js.
 * @param {ImageBitmap|null} logo Decoded once per batch by the caller.
 * @returns {number} How many marks were drawn — 0 when there was nothing to do.
 */
export function drawWatermark(ctx, width, height, settings, logo = null) {
  if (!ctx || !settings) return 0;

  const {
    mode = "text",
    text = "",
    layoutId,
    positionId,
    rotationId,
    opacityId,
    textSizeId,
    imageSizeId,
    colorId,
    fontId,
    densityId,
  } = settings;

  if (mode === "text" && !text) return 0;
  if (mode === "image" && !logo) return 0;

  const rotation = findRotation(rotationId).degrees;
  const radians = (rotation * Math.PI) / 180;

  // Mark dimensions. Text is MEASURED with the real font rather than estimated
  // — the deliberate advantage canvas has over the PDF watermark tool, which
  // approximates with an average advance width because measuring there would
  // mean pulling pdf-lib into the page bundle. Here the metrics are exact, so a
  // long string is spaced and inset correctly rather than approximately.
  let markWidth;
  let markHeight;
  let fontSize = 0;

  if (mode === "text") {
    fontSize = resolveFontSize(textSizeId, width, height);
    // Set before measuring: measureText reports against whatever font the
    // context currently holds, so measuring first returns the width in the
    // default 10px sans-serif and every placement derived from it is wrong.
    ctx.font = fontShorthand(fontId, fontSize);
    markWidth = ctx.measureText(text).width;
    markHeight = fontSize;
  } else {
    const size = resolveLogoSize(imageSizeId, logo.width, logo.height, width, height);
    markWidth = size.width;
    markHeight = size.height;
  }

  if (!(markWidth > 0) || !(markHeight > 0)) return 0;

  const marks = planMarks({
    layoutId,
    positionId,
    markWidth,
    markHeight,
    rotation,
    densityId,
    width,
    height,
  });

  if (marks.length === 0) return 0;

  ctx.save();
  ctx.globalAlpha = findOpacity(opacityId).value;

  if (mode === "text") {
    const color = findColor(colorId);

    // Centred on both axes so the mark's own centre is the point planMarks
    // placed. With the default alphabetic baseline the text sits above the
    // point by most of its height, which puts a "bottom right" credit partly
    // off the image — and "middle" is the one value needing no correction for
    // a font's ascent and descent.
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.strokeStyle = color.outline;
    ctx.lineWidth = outlineWidth(fontSize);
    // Round joins stop the stroke spiking off sharp glyph corners, which at
    // large sizes produces visible barbs on letters like A, W and M.
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    ctx.fillStyle = color.hex;

    for (const mark of marks) {
      ctx.save();
      // translate-then-rotate is what turns the mark about its own centre.
      // This is the canvas equivalent of the PDF module's
      // originForCenteredMark, except the platform does the corner arithmetic —
      // which is exactly why planMarks returns centres here and origins there.
      // Reversing these two rotates the whole coordinate system first and
      // swings every mark away from its anchor along an arc.
      ctx.translate(mark.x, mark.y);
      ctx.rotate(radians);
      // Stroke first, then fill over it. The stroke is centred on the glyph
      // outline, so drawing it second eats half its width into the letterforms
      // and thins the text at exactly the sizes where legibility matters most.
      ctx.strokeText(text, 0, 0);
      ctx.fillText(text, 0, 0);
      ctx.restore();
    }
  } else {
    for (const mark of marks) {
      ctx.save();
      ctx.translate(mark.x, mark.y);
      ctx.rotate(radians);
      // Drawn from the negative half-extent so the logo is centred on the mark
      // point, matching the text path's textAlign/textBaseline centring.
      ctx.drawImage(logo, -markWidth / 2, -markHeight / 2, markWidth, markHeight);
      ctx.restore();
    }
  }

  ctx.restore();
  return marks.length;
}
