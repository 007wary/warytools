// All pdf-lib document work runs here, off the main thread.
//
// Why a worker: pdf-lib's parse and save are synchronous, CPU-bound, and
// unyielding. Running them on the main thread froze the whole tab — no
// scrolling, no spinner animation, no cancel button — for the several seconds
// a large merge or a 500-page split takes. Users read a frozen tab as a crash
// and kill it. Here the UI thread stays free to animate progress and accept a
// cancel, which is the difference between "slow" and "broken".
//
// The worker is created with `new Worker(new URL(...), { type: "module" })`,
// which Turbopack/webpack detect statically and bundle — so pdf-lib lands in
// the worker chunk instead of the page's, and never loads for visitors who
// don't touch a PDF tool.
//
// Bytes cross the boundary as ArrayBuffers and are transferred, not copied
// (see the transfer list in pdfWorkerClient.js), so a 50 MB document does not
// briefly exist twice in memory.

import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import { ops, replies, createProgress } from "@/lib/pdfWorkerProtocol";
import { layoutImagePage } from "@/lib/pdfPageSizes";
import { toPdfBox } from "@/lib/cropGeometry";
import { formatPageLabel, placeNumber } from "@/lib/pdfPageNumbers";
import {
  planMarks,
  resolveFontSize,
  resolveImageSize,
  hexToRgb01,
  findRotation,
  findOpacity,
  findColor,
  normalizeAngle,
} from "@/lib/pdfWatermark";

// Requests the main thread has cancelled. Checked between pages so a cancelled
// 500-page split stops promptly instead of running to completion and throwing
// the result away.
const cancelled = new Set();

self.onmessage = async (event) => {
  const message = event.data;

  if (message?.type === "cancel") {
    cancelled.add(message.id);
    return;
  }

  const { id, op, payload } = message;

  try {
    const result = await runOp(id, op, payload);
    if (cancelled.has(id)) {
      cancelled.delete(id);
      return;
    }
    // Results are transferred too — the caller receives ownership of the
    // bytes rather than a structured clone of them.
    self.postMessage({ type: replies.RESULT, id, ...result.message }, result.transfer);
  } catch (error) {
    cancelled.delete(id);
    self.postMessage({
      type: replies.ERROR,
      id,
      // Error objects don't survive structured cloning with their prototype
      // intact, so the message is sent as a plain string and re-interpreted
      // by describePdfError() on the main thread.
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
 * pdf-lib refuses encrypted documents by default. `ignoreEncryption` covers
 * the overwhelmingly common case: a file with an owner password (restricting
 * printing or editing) but no user password, which every PDF reader opens
 * without prompting. Files with a real user password still throw, and
 * describePdfError turns that into the "remove the password" message.
 */
function loadPdf(bytes) {
  return PDFDocument.load(bytes, { ignoreEncryption: true });
}

async function runOp(id, op, payload) {
  switch (op) {
    case ops.INSPECT:
      return inspect(payload);
    case ops.MERGE:
      return merge(id, payload);
    case ops.EXTRACT_RANGE:
      return extractRange(payload);
    case ops.SPLIT_ALL:
      return splitAll(id, payload);
    case ops.COMPRESS:
      return compress(payload);
    case ops.REORDER:
      return reorder(payload);
    case ops.ROTATE:
      return rotate(payload);
    case ops.IMAGES_TO_PDF:
      return imagesToPdf(id, payload);
    case ops.CROP:
      return crop(payload);
    case ops.ADD_PAGE_NUMBERS:
      return addPageNumbers(payload);
    case ops.WATERMARK:
      return watermark(id, payload);
    default:
      throw new Error(`Unknown PDF worker op: ${op}`);
  }
}

// Reads structure only, so a tool can show page count and dimensions before
// the user commits to an operation.
async function inspect({ bytes }) {
  const pdf = await loadPdf(bytes);
  const pages = pdf.getPages().map((page) => {
    const { width, height } = page.getSize();
    return { width, height, rotation: page.getRotation().angle };
  });

  return {
    message: { pageCount: pdf.getPageCount(), pages },
    transfer: [],
  };
}

async function merge(id, { files }) {
  const merged = await PDFDocument.create();
  const total = files.length;

  for (let i = 0; i < total; i++) {
    throwIfCancelled(id);
    report(id, i, total, "Merging file");

    const source = await loadPdf(files[i]);
    const copied = await merged.copyPages(source, source.getPageIndices());
    copied.forEach((page) => merged.addPage(page));
  }

  throwIfCancelled(id);
  report(id, total, total, "Saving");

  const out = await merged.save({ useObjectStreams: true });
  return {
    message: { bytes: out.buffer, pageCount: merged.getPageCount() },
    transfer: [out.buffer],
  };
}

// Takes an explicit list of 1-based page numbers, so it serves both the
// simple "pages 3 to 9" case and a scattered selection like "1-3, 7, 12-15"
// with one code path. Order is honoured as given.
async function extractRange({ bytes, pages }) {
  const source = await loadPdf(bytes);
  const target = await PDFDocument.create();

  const indices = pages.map((page) => page - 1);

  const copied = await target.copyPages(source, indices);
  copied.forEach((page) => target.addPage(page));

  const out = await target.save({ useObjectStreams: true });
  return {
    message: { bytes: out.buffer, pageCount: target.getPageCount() },
    transfer: [out.buffer],
  };
}

// Returns each page as its own document. Zipping stays on the main thread:
// JSZip's compression is already async and yields, and keeping it out of here
// means the worker bundle doesn't carry a second large dependency.
async function splitAll(id, { bytes }) {
  const source = await loadPdf(bytes);
  const total = source.getPageCount();
  const documents = [];
  const transfer = [];

  for (let i = 0; i < total; i++) {
    throwIfCancelled(id);
    report(id, i, total, "Splitting page");

    const target = await PDFDocument.create();
    const [page] = await target.copyPages(source, [i]);
    target.addPage(page);

    const out = await target.save({ useObjectStreams: true });
    documents.push({ name: `page-${i + 1}.pdf`, bytes: out.buffer });
    transfer.push(out.buffer);
  }

  throwIfCancelled(id);
  report(id, total, total, "Splitting page");

  return { message: { documents, pageCount: total }, transfer };
}

// pdf-lib cannot re-encode embedded images, so this is a structural
// optimisation: object streams pack the cross-reference data and drop
// redundant objects. Real savings on text/vector PDFs, near-zero on scans —
// which is why the UI states that plainly rather than promising a percentage.
async function compress({ bytes }) {
  const pdf = await loadPdf(bytes);
  const out = await pdf.save({ useObjectStreams: true });
  return {
    message: { bytes: out.buffer, pageCount: pdf.getPageCount() },
    transfer: [out.buffer],
  };
}

async function reorder({ bytes, order }) {
  const source = await loadPdf(bytes);
  const target = await PDFDocument.create();

  const copied = await target.copyPages(source, order);
  copied.forEach((page) => target.addPage(page));

  const out = await target.save({ useObjectStreams: true });
  return {
    message: { bytes: out.buffer, pageCount: target.getPageCount() },
    transfer: [out.buffer],
  };
}

// `rotations[i]` is the extra turn to add to page i, on top of whatever
// rotation the page already carries — so a page that was already landscape
// stays consistent with what the preview showed.
async function rotate({ bytes, rotations }) {
  const pdf = await loadPdf(bytes);
  const pages = pdf.getPages();

  pages.forEach((page, index) => {
    const extra = rotations[index] || 0;
    if (extra === 0) return;
    const current = page.getRotation().angle;
    page.setRotation(degrees((current + extra) % 360));
  });

  const out = await pdf.save({ useObjectStreams: true });
  return {
    message: { bytes: out.buffer, pageCount: pages.length },
    transfer: [out.buffer],
  };
}

/**
 * Builds a PDF from a list of images, one page each.
 *
 * Each entry arrives already reduced to something pdf-lib can embed —
 * `embedAs` is "jpg" or "png" and the bytes match, because the PDF spec has no
 * WebP or AVIF image filter and the client transcodes those on the way in (see
 * pdfImageEmbed.js). Doing the transcode there rather than here keeps this
 * worker free of canvas code and lets it reuse the image pipeline that already
 * handles EXIF orientation.
 *
 * Layout comes from layoutImagePage(), shared with the client so the preview
 * and the output are computed by the same function rather than two
 * implementations that drift.
 */
async function imagesToPdf(id, { images, pageSizeId, orientation, marginId }) {
  const pdf = await PDFDocument.create();
  const total = images.length;

  for (let i = 0; i < total; i++) {
    throwIfCancelled(id);
    report(id, i, total, "Adding image");

    const entry = images[i];

    // pdf-lib picks the embedder from the *bytes*, so handing JPEG bytes to
    // embedPng fails with an opaque parse error rather than a useful one. The
    // client decides which to use from the sniffed type; this just obeys.
    const embedded =
      entry.embedAs === "png" ? await pdf.embedPng(entry.bytes) : await pdf.embedJpg(entry.bytes);

    const layout = layoutImagePage({
      // The embedded image's own dimensions, not the source file's — a
      // transcode can change them, and the layout has to describe what is
      // actually being drawn.
      imageWidth: embedded.width,
      imageHeight: embedded.height,
      pageSizeId,
      orientation,
      marginId,
    });

    const page = pdf.addPage([layout.pageWidth, layout.pageHeight]);
    page.drawImage(embedded, {
      x: layout.x,
      y: layout.y,
      width: layout.width,
      height: layout.height,
    });
  }

  throwIfCancelled(id);
  report(id, total, total, "Saving");

  const out = await pdf.save({ useObjectStreams: true });
  return {
    message: { bytes: out.buffer, pageCount: pdf.getPageCount() },
    transfer: [out.buffer],
  };
}

/**
 * Applies a crop rectangle to selected pages.
 *
 * Sets **both** the CropBox and the MediaBox, which is the detail that decides
 * whether this tool actually works. CropBox alone is what most readers display,
 * so the crop looks correct on screen — but the MediaBox still describes the
 * full sheet, so printing and many converters fall back to the uncropped page
 * and the user discovers it after sending the file. Setting both means the
 * document is cropped by every consumer, not just by viewers.
 *
 * Note this hides content rather than deleting it: the page's drawing
 * operations are untouched and someone can widen the box again. That's the same
 * behaviour as every other PDF cropper, and the tool's copy says so rather than
 * implying the cropped-away area is gone.
 *
 * `rects` maps a page index to a normalised rectangle. Pages absent from it are
 * left exactly as they are, so "crop the first page only" doesn't rewrite the
 * rest of the document.
 */
async function crop({ bytes, rects }) {
  const pdf = await loadPdf(bytes);
  const pages = pdf.getPages();

  let croppedCount = 0;

  pages.forEach((page, index) => {
    const rect = rects[index];
    if (!rect) return;

    // The page's existing box is the frame the normalised rectangle is
    // relative to — not the intrinsic size. A page already cropped once has a
    // non-zero origin, and measuring against anything else shifts the new crop
    // off the visible area.
    const media = page.getMediaBox();

    // The page's /Rotate has to go in too. The user drew the rectangle against
    // the page as *displayed*, and on a quarter-turned page that frame differs
    // from unrotated user space — without this the crop lands rotated 90° from
    // the selection, with no error to hint at it.
    const box = toPdfBox(rect, media, page.getRotation().angle);

    page.setCropBox(box.x, box.y, box.width, box.height);
    page.setMediaBox(box.x, box.y, box.width, box.height);

    // BleedBox and TrimBox, when present, describe production areas outside
    // the new crop and would leave readers with a box larger than the page.
    // Only set when the document actually carries them.
    try {
      page.setBleedBox(box.x, box.y, box.width, box.height);
      page.setTrimBox(box.x, box.y, box.width, box.height);
    } catch {
      // Not every document has these, and a missing one is not an error worth
      // failing the whole crop over.
    }

    croppedCount++;
  });

  const out = await pdf.save({ useObjectStreams: true });
  return {
    message: { bytes: out.buffer, pageCount: pages.length, croppedCount },
    transfer: [out.buffer],
  };
}

/**
 * Stamps page numbers onto a document.
 *
 * Draws onto the existing pages rather than rebuilding the document, so
 * bookmarks, links, and form fields survive — copyPages into a fresh document
 * (the pattern the reorder/extract ops use) drops all of those, which on a
 * numbered contract or report is a worse outcome than not numbering it.
 *
 * `plan` arrives from planPageNumbers() in the client, already resolved to
 * {index, number} pairs, so the two sides can't disagree about which page gets
 * what — the preview shows exactly what this loop draws.
 *
 * Helvetica is used unembedded. It's one of the 14 standard PDF fonts every
 * reader carries, so nothing is added to the file size, and it only has to
 * render digits and the words "Page"/"of" — all WinAnsi, so there is no
 * encoding risk of the kind a user-supplied string would carry.
 */
async function addPageNumbers({ bytes, plan, formatId, positionId, marginPoints, fontSize }) {
  const pdf = await loadPdf(bytes);
  const pages = pdf.getPages();

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const total = plan.length;

  for (const { index, number } of plan) {
    const page = pages[index];
    // A plan referencing a page that isn't there would throw on the next line.
    // Skipping keeps a stale plan (file re-selected mid-edit) from failing the
    // whole run rather than just omitting one stamp.
    if (!page) continue;

    const text = formatPageLabel({ formatId, number, total });

    // Measured with the same font and size it is drawn at — the width is what
    // right-alignment and centring are computed from, so a guessed value would
    // put every non-left-aligned number slightly off.
    const textWidth = font.widthOfTextAtSize(text, fontSize);

    // The CropBox, not the MediaBox: that is what a reader displays, so on a
    // page cropped once the MediaBox describes edges that are no longer
    // visible, and a margin measured from it would push the number out of view.
    const box = page.getCropBox();

    const spot = placeNumber({
      positionId,
      marginPoints,
      textWidth,
      fontSize,
      box,
      // The page's /Rotate. Without it the number lands along the edge of a
      // quarter-turned page, rotated — see placeNumber's comment.
      rotation: page.getRotation().angle,
    });

    page.drawText(text, {
      x: spot.x,
      y: spot.y,
      size: fontSize,
      font,
      color: rgb(0, 0, 0),
      rotate: degrees(spot.rotate),
    });
  }

  const out = await pdf.save({ useObjectStreams: true });
  return {
    message: { bytes: out.buffer, pageCount: pages.length, numberedCount: total },
    transfer: [out.buffer],
  };
}

/**
 * Stamps a text or image watermark across selected pages.
 *
 * Like addPageNumbers, this draws onto the existing pages rather than rebuilding
 * the document — copyPages into a fresh doc drops bookmarks, links, and form
 * fields, and a watermarked contract losing its signature fields is a worse
 * outcome than an unwatermarked one.
 *
 * `pageIndices` names the pages to mark. Pages absent from it are untouched, so
 * "watermark the first page only" doesn't rewrite the rest of the document.
 *
 * Placement comes entirely from planMarks(), shared with the client, so the
 * preview and the output are computed by one function rather than two that
 * drift. Everything about rotation and tiling lives there.
 */
async function watermark(id, payload) {
  const {
    bytes,
    mode,
    text,
    imageBytes,
    imageEmbedAs,
    pageIndices,
    layoutId,
    positionId,
    rotationId,
    opacityId,
    textSizeId,
    imageSizeId,
    colorId,
    densityId,
  } = payload;

  const pdf = await loadPdf(bytes);
  const pages = pdf.getPages();

  const markRotation = findRotation(rotationId).degrees;
  const opacity = findOpacity(opacityId).value;

  // Helvetica-Bold rather than Helvetica: a watermark is drawn at low opacity,
  // and a light-weight face at 15% grey all but disappears on a printed page.
  // Still one of the 14 standard fonts, so nothing is added to the file size.
  //
  // The text is user-supplied, which is the difference from addPageNumbers:
  // validateWatermarkText() has already rejected anything outside WinAnsi on the
  // client, since pdf-lib's encodeText throws from deep inside the library with
  // a message no user could act on.
  const font = mode === "text" ? await pdf.embedFont(StandardFonts.HelveticaBold) : null;

  // Embedded once for the whole document, not per page. pdf-lib deduplicates
  // fonts but not images, so embedding inside the loop would put a full copy of
  // the logo in the file for every page marked — a 200 KB PNG on a 100-page
  // document is 20 MB of identical bytes.
  const image =
    mode === "image"
      ? imageEmbedAs === "png"
        ? await pdf.embedPng(imageBytes)
        : await pdf.embedJpg(imageBytes)
      : null;

  const { r, g, b } = hexToRgb01(findColor(colorId).hex);
  const color = mode === "text" ? rgb(r, g, b) : undefined;

  const targets = Array.isArray(pageIndices)
    ? pageIndices
    : pages.map((_page, index) => index);

  const total = targets.length;
  let markedCount = 0;
  let marksDrawn = 0;

  for (let i = 0; i < total; i++) {
    throwIfCancelled(id);
    report(id, i, total, "Watermarking page");

    const page = pages[targets[i]];
    // A stale index (file re-selected mid-edit) would throw on the next line.
    // Skipping omits one page rather than failing the whole run.
    if (!page) continue;

    // The CropBox, not the MediaBox: that is what a reader displays, so on a
    // page cropped once the MediaBox describes edges that are no longer visible
    // and the mark would be sized and placed against an area nobody sees.
    const box = page.getCropBox();
    const pageRotation = page.getRotation().angle;

    // Displayed dimensions, which is the frame the sizing presets mean. On a
    // quarter-turned page the axes swap, so sizing against the raw box would
    // make the mark on a rotated landscape page a different size from the one
    // on its unrotated neighbour in the same document.
    const angle = normalizeAngle(pageRotation);
    const quarterTurned = angle === 90 || angle === 270;
    const displayWidth = quarterTurned ? box.height : box.width;
    const displayHeight = quarterTurned ? box.width : box.height;

    let markWidth;
    let markHeight;
    let fontSize = 0;

    if (mode === "text") {
      fontSize = resolveFontSize(textSizeId, displayWidth, displayHeight);
      // Measured with the same font and size it is drawn at — the width drives
      // every placement and tile step, so a guessed value would misplace the
      // whole grid.
      markWidth = font.widthOfTextAtSize(text, fontSize);
      // The font's own height at this size, not the size itself: drawText
      // positions from the baseline, and using the point size as the height
      // would place a tiled grid slightly off vertically on every row.
      markHeight = font.heightAtSize(fontSize);
    } else {
      const size = resolveImageSize(
        imageSizeId,
        image.width,
        image.height,
        displayWidth,
        displayHeight
      );
      markWidth = size.width;
      markHeight = size.height;
    }

    const marks = planMarks({
      layoutId,
      positionId,
      markWidth,
      markHeight,
      markRotation,
      densityId,
      box,
      pageRotation,
    });

    if (marks.length === 0) continue;

    for (const mark of marks) {
      if (mode === "text") {
        page.drawText(text, {
          x: mark.x,
          y: mark.y,
          size: fontSize,
          font,
          color,
          opacity,
          rotate: degrees(mark.rotate),
        });
      } else {
        page.drawImage(image, {
          x: mark.x,
          y: mark.y,
          width: markWidth,
          height: markHeight,
          opacity,
          rotate: degrees(mark.rotate),
        });
      }
    }

    marksDrawn += marks.length;
    markedCount++;
  }

  throwIfCancelled(id);
  report(id, total, total, "Saving");

  const out = await pdf.save({ useObjectStreams: true });
  return {
    message: {
      bytes: out.buffer,
      pageCount: pages.length,
      markedCount,
      marksDrawn,
    },
    transfer: [out.buffer],
  };
}
