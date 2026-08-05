// All image decode/resample/encode work runs here, off the main thread.
//
// Why a worker: decoding a 50-megapixel phone photo and re-encoding it takes
// seconds of solid CPU, and on the main thread that froze the tab — the same
// problem the PDF tools had. Here the UI stays free to show per-file progress
// through a batch and accept a cancel.
//
// Two platform pieces make this possible and are the reason the tools are
// noticeably better than before:
//
//   - createImageBitmap() decodes off the main thread and, critically,
//     accepts `imageOrientation: "from-image"`, which applies the EXIF
//     orientation tag. The old <img>+canvas path ignored EXIF entirely, so
//     every portrait phone photo came out of the tools rotated sideways.
//   - OffscreenCanvas lets the draw and encode happen here rather than
//     marshalling pixels back to the DOM.

import { planDownscaleSteps, needsMatte } from "@/lib/imageResampling";
import { replies, createProgress } from "@/lib/pdfWorkerProtocol";

const cancelled = new Set();

export const imageOps = {
  PROCESS: "process",
};

self.onmessage = async (event) => {
  const message = event.data;

  if (message?.type === "cancel") {
    cancelled.add(message.id);
    return;
  }

  const { id, payload } = message;

  try {
    const result = await processBatch(id, payload);
    if (cancelled.has(id)) {
      cancelled.delete(id);
      return;
    }
    self.postMessage({ type: replies.RESULT, id, ...result.message }, result.transfer);
  } catch (error) {
    cancelled.delete(id);
    self.postMessage({
      type: replies.ERROR,
      id,
      message: String(error?.message || error),
    });
  }
};

function report(id, completed, total, label) {
  self.postMessage(createProgress(id, completed, total, label));
}

function throwIfCancelled(id) {
  if (cancelled.has(id)) {
    const error = new Error("cancelled");
    error.cancelled = true;
    throw error;
  }
}

/**
 * Processes a batch of images with one shared set of settings.
 *
 * Files are handled one at a time rather than in parallel: each decoded
 * bitmap can be hundreds of megabytes, and decoding twenty at once is a
 * reliable way to have the browser kill the worker. Sequential is slower on
 * paper and far more likely to actually finish.
 */
async function processBatch(id, { files, settings }) {
  const outputs = [];
  const transfer = [];
  const failures = [];
  const total = files.length;

  for (let i = 0; i < total; i++) {
    throwIfCancelled(id);
    report(id, i, total, "Processing image");

    const entry = files[i];
    try {
      const output = await processOne(entry, settings);
      // The source index travels with the result. Matching on array position
      // breaks as soon as one file fails (every later result shifts onto the
      // wrong source), and matching on filename breaks when a batch contains
      // two files with the same name from different folders.
      outputs.push({ ...output, index: i });
      transfer.push(output.bytes);
    } catch (error) {
      // One unreadable file in a batch of twenty must not lose the other
      // nineteen results. Failures are collected and reported alongside the
      // successes rather than aborting the run.
      failures.push({ index: i, name: entry.name, message: String(error?.message || error) });
    }
  }

  throwIfCancelled(id);
  report(id, total, total, "Processing image");

  return { message: { outputs, failures }, transfer };
}

async function processOne(entry, settings) {
  const { blob, name } = entry;

  // "from-image" is what fixes sideways phone photos. Without it the bitmap
  // carries raw sensor orientation and the EXIF tag is silently dropped.
  const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });

  try {
    const sourceWidth = bitmap.width;
    const sourceHeight = bitmap.height;

    const { width, height } = resolveSize(sourceWidth, sourceHeight, settings);

    // Stepwise halving rather than one big draw. See planDownscaleSteps —
    // a single draw from 4000px to 400px undersamples badly and is why the
    // old resize output looked jagged.
    const steps = planDownscaleSteps(sourceWidth, sourceHeight, width, height);

    let current = bitmap;
    let currentIsSource = true;

    for (let s = 0; s < steps.length; s++) {
      const step = steps[s];
      const isFinal = s === steps.length - 1;

      const canvas = new OffscreenCanvas(step.width, step.height);
      const ctx = canvas.getContext("2d", {
        // Tells the compositor there's no transparency to preserve when the
        // output format can't carry it, which lets it skip a blend pass.
        alpha: !needsMatte(settings.format),
      });

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      // JPG has no alpha channel: without a matte, transparent pixels encode
      // as black, which reads as a corrupted image rather than a format
      // limitation. Only needed on the final draw.
      if (isFinal && needsMatte(settings.format)) {
        ctx.fillStyle = settings.matteColor || "#ffffff";
        ctx.fillRect(0, 0, step.width, step.height);
      }

      ctx.drawImage(current, 0, 0, step.width, step.height);

      // Intermediate bitmaps are explicitly closed; letting GC find them is
      // too slow when each one is tens of megabytes and a batch creates
      // several per file.
      if (!currentIsSource) current.close?.();
      current = canvas.transferToImageBitmap();
      currentIsSource = false;
    }

    const outCanvas = new OffscreenCanvas(current.width, current.height);
    const outCtx = outCanvas.getContext("2d", { alpha: !needsMatte(settings.format) });
    if (needsMatte(settings.format)) {
      outCtx.fillStyle = settings.matteColor || "#ffffff";
      outCtx.fillRect(0, 0, current.width, current.height);
    }
    outCtx.drawImage(current, 0, 0);
    current.close?.();

    const encoded = await outCanvas.convertToBlob({
      type: settings.format,
      quality: settings.quality,
    });

    // A browser that can't encode the requested type silently falls back to
    // PNG rather than throwing. Detecting that here means the tool can say
    // so instead of handing over a file whose contents don't match its name.
    if (encoded.type !== settings.format) {
      throw new Error(
        `This browser can't encode ${settings.format} — it produced ${encoded.type} instead.`
      );
    }

    return {
      name,
      bytes: await encoded.arrayBuffer(),
      type: encoded.type,
      width: outCanvas.width,
      height: outCanvas.height,
      sourceWidth,
      sourceHeight,
      sourceSize: blob.size,
    };
  } finally {
    bitmap.close?.();
  }
}

/**
 * Works out the output size for one image from the shared batch settings.
 *
 * Percentage and "max edge" are relative to each image, so a batch of mixed
 * sizes scales sensibly instead of being forced to identical dimensions.
 */
function resolveSize(sourceWidth, sourceHeight, settings) {
  if (settings.mode === "percentage") {
    const scale = settings.percentage / 100;
    return {
      width: Math.max(1, Math.round(sourceWidth * scale)),
      height: Math.max(1, Math.round(sourceHeight * scale)),
    };
  }

  if (settings.mode === "maxEdge") {
    const longest = Math.max(sourceWidth, sourceHeight);
    if (longest <= settings.maxEdge) return { width: sourceWidth, height: sourceHeight };
    const scale = settings.maxEdge / longest;
    return {
      width: Math.max(1, Math.round(sourceWidth * scale)),
      height: Math.max(1, Math.round(sourceHeight * scale)),
    };
  }

  if (settings.mode === "dimensions") {
    return { width: settings.width, height: settings.height };
  }

  // "none" — re-encode at source resolution (compress and convert).
  return { width: sourceWidth, height: sourceHeight };
}
