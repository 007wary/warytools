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

import { planDownscaleSteps, needsMatte, resolveOutputSize } from "@/lib/imageResampling";
import { replies, createProgress } from "@/lib/pdfWorkerProtocol";
import { drawWatermark } from "@/lib/imageWatermarkDraw";
import { checkPixelBudget } from "@/lib/imageValidation";

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
    if (cancelled.has(id)) return;
    self.postMessage({ type: replies.RESULT, id, ...result.message }, result.transfer);
  } catch (error) {
    // A cancellation surfaces here as a throw from throwIfCancelled. The client
    // has already torn the worker down by then, so posting an ERROR back would
    // arrive at a terminated port at best and reject an already-settled promise
    // at worst.
    if (!error?.cancelled) {
      self.postMessage({
        type: replies.ERROR,
        id,
        message: String(error?.message || error),
      });
    }
  } finally {
    // Cleared on every exit path, including the ones that returned early above.
    // The old code deleted the id in two of the three branches, so a cancel
    // that lost the race with a completing batch left its id in the set for the
    // life of the worker — and any later request that happened to reuse it
    // would be discarded as cancelled before it ran.
    cancelled.delete(id);
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

  // The watermark logo is decoded ONCE for the whole batch rather than per
  // file. Decoding it inside the loop would repeat the same work for every
  // image — on a fifty-file batch that is fifty identical decodes of the same
  // PNG, which is pure waste and visibly slows the run.
  let logo = null;
  if (settings?.watermark?.mode === "image" && settings.watermark.logoBlob) {
    logo = await createImageBitmap(settings.watermark.logoBlob, {
      imageOrientation: "from-image",
    });
  }

  try {
    for (let i = 0; i < total; i++) {
      throwIfCancelled(id);
      report(id, i, total, "Processing image");

      const entry = files[i];
      try {
        const output = await processOne(entry, settings, logo);
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
  } finally {
    // Closed even when the batch throws or is cancelled mid-run. A decoded
    // bitmap can be tens of megabytes and letting GC find it is too slow when
    // the user is churning through settings and re-running.
    logo?.close?.();
  }

  throwIfCancelled(id);
  report(id, total, total, "Processing image");

  return { message: { outputs, failures }, transfer };
}

async function processOne(entry, settings, logo = null) {
  const { blob, name } = entry;

  // "from-image" is what fixes sideways phone photos. Without it the bitmap
  // carries raw sensor orientation and the EXIF tag is silently dropped.
  const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });

  // Declared outside the try so the finally can release an intermediate bitmap
  // that a mid-pipeline throw left live.
  let current = bitmap;
  let currentIsSource = true;

  try {
    const sourceWidth = bitmap.width;
    const sourceHeight = bitmap.height;

    const { width, height } = resolveOutputSize(sourceWidth, sourceHeight, settings);

    // Checked here rather than in each client, because the decoded dimensions
    // are the thing being checked and only the worker has them — a client would
    // have to decode the file a second time to learn them.
    //
    // This guards the OUTPUT size, which is what a canvas is actually allocated
    // at. Past the ceiling canvas does not throw: it silently yields a blank
    // surface, so an oversized image comes back as a plausible file full of
    // nothing. Only Resize checked this, and only on its exact-dimensions
    // branch — so Compress, Convert and Watermark, all of which run at source
    // resolution, handed back blank images for any photo above the ceiling with
    // no error anywhere. Same silent-failure class as HEIC and scanned PDFs.
    const budget = checkPixelBudget(width, height);
    if (!budget.ok) throw new Error(budget.error);

    // Stepwise halving rather than one big draw. See planDownscaleSteps —
    // a single draw from 4000px to 400px undersamples badly and is why the
    // old resize output looked jagged.
    const steps = planDownscaleSteps(sourceWidth, sourceHeight, width, height);
    const matte = needsMatte(settings.format);

    // The final step draws directly into the canvas that gets encoded, rather
    // than into a scratch canvas that is then transferred to a bitmap and
    // copied once more into an output canvas.
    //
    // That extra round trip cost a second full-size allocation and a second
    // full-size draw for EVERY image, and it was worst in exactly the common
    // case: Compress, Convert and Watermark all run at source resolution, where
    // planDownscaleSteps returns a single no-op step. A 40-megapixel photo was
    // therefore allocating two 160 MB surfaces and copying between them to
    // achieve nothing at all before the encode.
    let outCanvas = null;
    let outCtx = null;

    for (let s = 0; s < steps.length; s++) {
      const step = steps[s];
      const isFinal = s === steps.length - 1;

      const canvas = new OffscreenCanvas(step.width, step.height);
      const ctx = canvas.getContext("2d", {
        // Tells the compositor there's no transparency to preserve when the
        // output format can't carry it, which lets it skip a blend pass.
        alpha: !matte,
      });

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      // JPG has no alpha channel: without a matte, transparent pixels encode
      // as black, which reads as a corrupted image rather than a format
      // limitation. Only needed on the final draw.
      if (isFinal && matte) {
        ctx.fillStyle = settings.matteColor || "#ffffff";
        ctx.fillRect(0, 0, step.width, step.height);
      }

      ctx.drawImage(current, 0, 0, step.width, step.height);

      // Intermediate bitmaps are explicitly closed; letting GC find them is
      // too slow when each one is tens of megabytes and a batch creates
      // several per file.
      if (!currentIsSource) current.close?.();

      if (isFinal) {
        // Kept as a canvas, not transferred to a bitmap: the watermark still
        // has to draw onto it and convertToBlob reads from it directly.
        outCanvas = canvas;
        outCtx = ctx;
        current = null;
        currentIsSource = false;
      } else {
        current = canvas.transferToImageBitmap();
        currentIsSource = false;
      }
    }

    // planDownscaleSteps is documented never to return an empty list, so the
    // loop above always sets this. Asserted rather than assumed because the
    // failure mode if that ever changed is the one this file keeps guarding
    // against: not a crash, but a blank image encoded and handed over as if it
    // were the user's photo.
    if (!outCanvas) throw new Error("No output surface was produced for this image.");

    // Drawn after every resize step and before the encode, which is the only
    // correct point in the pipeline. Watermarking first and then downscaling
    // would resample the mark along with the photo — softening the crisp text
    // edges the outline exists to provide — and would shrink a mark sized
    // against the source rather than the output.
    if (settings.watermark) {
      drawWatermark(outCtx, outCanvas.width, outCanvas.height, settings.watermark, logo);
    }

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
    // An intermediate bitmap is live here only when the run threw part-way
    // through the halving loop (an over-budget size, a failed encode). The
    // happy path has already closed or consumed it, and close() twice is a
    // no-op — but leaving a tens-of-megabytes bitmap to GC on the error path
    // is how a batch that hits a few failures exhausts the worker.
    if (!currentIsSource) current?.close?.();
  }
}
