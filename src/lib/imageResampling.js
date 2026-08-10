// Geometry and format decisions for the image tools.
//
// Pure functions only — no canvas, no DOM. Per the repo convention, logic that
// decides what the user gets has to live where it can be tested, and the
// stepwise-downscale schedule below is exactly the kind of thing that is
// impossible to verify by eye but trivial to verify as numbers.

/**
 * Plans a sequence of halving steps down to a target size.
 *
 * The bug this fixes: drawImage() from 4000px straight to 400px asks the
 * browser to reconstruct one output pixel from a 10x10 source block, and the
 * bilinear filter it uses only samples a 2x2 neighbourhood. Nearly all the
 * source detail is simply never read, which is why the old resize output
 * looked jagged and shimmered on fine detail — classic undersampling.
 *
 * Halving repeatedly keeps every step within what bilinear can handle
 * correctly, so all source pixels contribute. This is what every serious
 * image pipeline does, and it costs a few extra draws on a scratch canvas.
 *
 * Upscaling and modest downscales (>1/2) need no intermediate steps — a
 * single draw is already accurate there.
 *
 * @param {number} fromWidth
 * @param {number} fromHeight
 * @param {number} toWidth
 * @param {number} toHeight
 * @returns {{width: number, height: number}[]} Sizes to draw through, ending
 *   at exactly the target. Never empty.
 */
export function planDownscaleSteps(fromWidth, fromHeight, toWidth, toHeight) {
  const steps = [];

  if (
    !Number.isFinite(fromWidth) ||
    !Number.isFinite(fromHeight) ||
    !Number.isFinite(toWidth) ||
    !Number.isFinite(toHeight) ||
    toWidth < 1 ||
    toHeight < 1
  ) {
    return [{ width: Math.max(1, toWidth || 1), height: Math.max(1, toHeight || 1) }];
  }

  let currentWidth = fromWidth;
  let currentHeight = fromHeight;

  // Halve while doing so still leaves us above the target. The guard against
  // both dimensions being at target prevents an infinite loop on a
  // one-dimensional resize (e.g. 1000x100 -> 100x100).
  while (currentWidth / 2 >= toWidth && currentHeight / 2 >= toHeight) {
    currentWidth = Math.max(toWidth, Math.floor(currentWidth / 2));
    currentHeight = Math.max(toHeight, Math.floor(currentHeight / 2));

    if (currentWidth === toWidth && currentHeight === toHeight) break;
    steps.push({ width: currentWidth, height: currentHeight });
  }

  steps.push({ width: toWidth, height: toHeight });
  return steps;
}

/**
 * Resolves the output dimensions for a resize request.
 *
 * Strings in, because these come from number inputs: Number("") is 0, so a
 * cleared box is indistinguishable from a deliberate zero once coerced. This
 * is the same trap documented in pdfPageRange.js and it caused a real bug in
 * this very tool.
 *
 * @param {object} params
 * @param {"dimensions"|"percentage"} params.mode
 * @param {string} params.width       Raw input value.
 * @param {string} params.height      Raw input value.
 * @param {number} params.percentage
 * @param {number} params.originalWidth
 * @param {number} params.originalHeight
 * @returns {{ok: true, width: number, height: number, isUpscale: boolean} | {ok: false, error: string}}
 */
export function resolveTargetSize({
  mode,
  width,
  height,
  percentage,
  originalWidth,
  originalHeight,
}) {
  if (!originalWidth || !originalHeight) {
    return { ok: false, error: "Load an image before choosing a size." };
  }

  let targetWidth;
  let targetHeight;

  if (mode === "percentage") {
    const scale = Number(percentage);
    if (!Number.isFinite(scale) || scale <= 0) {
      return { ok: false, error: "Choose a scale above 0%." };
    }
    targetWidth = Math.round((originalWidth * scale) / 100);
    targetHeight = Math.round((originalHeight * scale) / 100);
  } else {
    const widthText = typeof width === "string" ? width.trim() : String(width ?? "");
    const heightText = typeof height === "string" ? height.trim() : String(height ?? "");

    if (widthText === "" || heightText === "") {
      return { ok: false, error: "Enter both a width and a height in pixels." };
    }

    targetWidth = Number(widthText);
    targetHeight = Number(heightText);

    if (!Number.isInteger(targetWidth) || !Number.isInteger(targetHeight)) {
      return { ok: false, error: "Width and height must be whole numbers of pixels." };
    }
  }

  if (targetWidth < 1 || targetHeight < 1) {
    return { ok: false, error: "Width and height must be at least 1 pixel." };
  }

  return {
    ok: true,
    width: targetWidth,
    height: targetHeight,
    // Surfaced so the UI can warn: enlarging invents pixels that were never
    // captured, and the result is always softer than the original. Users
    // routinely expect the opposite.
    isUpscale: targetWidth > originalWidth || targetHeight > originalHeight,
  };
}

/**
 * Applies an aspect-ratio-locked edit to one dimension.
 *
 * Returns null for a blank or invalid entry rather than mirroring it, so
 * clearing one box doesn't drive the other to zero — the bug that made both
 * fields read 0 in the old tool.
 *
 * @returns {string|null} The partner field's new value, or null to leave it.
 */
export function linkedDimension(value, sourceOriginal, targetOriginal) {
  const text = typeof value === "string" ? value.trim() : String(value ?? "");
  if (text === "") return null;

  const parsed = Number(text);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  if (!sourceOriginal || !targetOriginal) return null;

  return String(Math.max(1, Math.round((parsed / sourceOriginal) * targetOriginal)));
}

/**
 * Chooses the encoder settings for an output format.
 *
 * Centralised because each tool previously made its own decisions and they
 * disagreed: Resize silently forced every non-PNG input to JPG, discarding a
 * WebP source without telling anyone.
 */
export function encoderFor(mimeType, quality) {
  const lossless = mimeType === "image/png";
  return {
    mimeType,
    // Passing a quality to a lossless encoder is meaningless, and some
    // browsers treat an out-of-range value as a reason to fall back to the
    // default format entirely.
    quality: lossless ? undefined : clampQuality(quality),
  };
}

export function clampQuality(quality) {
  const value = Number(quality);
  if (!Number.isFinite(value)) return 0.85;
  return Math.min(1, Math.max(0.05, value));
}

/**
 * Whether a transparent source will lose its alpha channel in this format.
 *
 * Drives the white-matte fill: without it, transparent pixels encode as
 * black in JPG, which looks like corruption rather than a format limitation.
 */
export function needsMatte(outputMime) {
  return outputMime === "image/jpeg";
}

/** Filename extension for an output mime type. */
export function extensionFor(mimeType) {
  switch (mimeType) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/avif":
      return "avif";
    default:
      return "jpg";
  }
}

/**
 * Works out one image's output size from the batch's shared settings.
 *
 * Lives here rather than inline in image.worker.js for the reason the repo
 * gives for pdfPageRange.js: the worker cannot be imported by the test suite
 * (it touches `self` at module scope and vitest runs in node), so logic left
 * there is logic that can never be covered. This decides the dimensions of
 * every file the image tools hand back, which makes it exactly the kind of
 * thing that has to be reachable by a test.
 *
 * Every branch clamps. The `dimensions` branch previously passed its settings
 * straight through, so a non-finite width became `new OffscreenCanvas(NaN, NaN)`
 * — which does not throw; it yields a 0x0 surface that encodes as an empty
 * image. Same silent-failure class as an over-budget canvas.
 *
 * Percentage and "max edge" are relative to each image, so a batch of mixed
 * sizes scales sensibly instead of being forced to identical dimensions.
 *
 * @param {number} sourceWidth
 * @param {number} sourceHeight
 * @param {{mode: string, percentage?: number, maxEdge?: number, width?: number, height?: number}} settings
 * @returns {{width: number, height: number}} Always finite, always >= 1.
 */
export function resolveOutputSize(sourceWidth, sourceHeight, settings = {}) {
  const source = {
    width: Math.max(1, Math.round(Number(sourceWidth) || 1)),
    height: Math.max(1, Math.round(Number(sourceHeight) || 1)),
  };

  const clamp = (value, fallback) => {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 1) return fallback;
    return Math.max(1, Math.round(number));
  };

  if (settings.mode === "percentage") {
    const percentage = Number(settings.percentage);
    if (!Number.isFinite(percentage) || percentage <= 0) return source;
    const scale = percentage / 100;
    return {
      width: clamp(source.width * scale, 1),
      height: clamp(source.height * scale, 1),
    };
  }

  if (settings.mode === "maxEdge") {
    const maxEdge = Number(settings.maxEdge);
    const longest = Math.max(source.width, source.height);
    if (!Number.isFinite(maxEdge) || maxEdge <= 0 || longest <= maxEdge) return source;
    const scale = maxEdge / longest;
    return {
      width: clamp(source.width * scale, 1),
      height: clamp(source.height * scale, 1),
    };
  }

  if (settings.mode === "dimensions") {
    // Falls back to the source dimension rather than to 1: a bad value means
    // the request was malformed, and returning the untouched size is closest to
    // "do no harm" — a 1x1 output would look like the tool destroyed the image.
    return {
      width: clamp(settings.width, source.width),
      height: clamp(settings.height, source.height),
    };
  }

  // "none" — re-encode at source resolution (compress, convert, watermark).
  return source;
}

/**
 * Renames a source file for its converted output, preserving the stem.
 *
 * "holiday-photo.png" -> "holiday-photo.jpg" is far more useful in a batch of
 * twenty than twenty files all called "converted.jpg".
 */
export function outputFilename(sourceName, mimeType, suffix = "") {
  const extension = extensionFor(mimeType);
  const stem = String(sourceName || "image").replace(/\.[^./\\]+$/, "") || "image";
  return `${stem}${suffix}.${extension}`;
}
