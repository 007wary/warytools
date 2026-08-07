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

// @cantoo/pdf-lib is a maintained fork of pdf-lib with an identical API plus
// the one thing stock pdf-lib has never had: the standard security handler.
// It is used for EVERY op here, not just the two encryption ones — running two
// forks side by side would ship two copies of the same library in this chunk
// and, worse, give a document loaded by one and saved by the other two
// different object models. API parity was verified against every call this
// file makes (copyPages, embedPng/Jpg, getCropBox, getRotation, drawText,
// widthOfTextAtSize, heightAtSize) before the swap.
//
// Cost: ~148 KB minified over stock pdf-lib, and it lands in the worker chunk
// only — never the page bundle. The alternative for encryption was qpdf
// compiled to WASM, which is 1.27 MB of .wasm, a 0.0.2 release from a single
// unaffiliated maintainer, and would still have left pdf-lib in place for
// everything else.
import { PDFDocument, StandardFonts, PDFName, PDFObjectCopier, degrees, rgb } from "@cantoo/pdf-lib";
import { PRESERVED_CATALOG_KEYS, toSecurityPermissions } from "@/lib/pdfEncryption";
import {
  placementToPdfRect,
  drawOriginFor,
  findTypeFace,
  findInkColor,
  hexToRgb01 as signatureHexToRgb01,
} from "@/lib/pdfSignature";
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
    case ops.SIGN:
      return sign(payload);
    case ops.INSPECT_ENCRYPTION:
      return inspectEncryption(payload);
    case ops.UNLOCK:
      return unlock(payload);
    case ops.PROTECT:
      return protect(payload);
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

/**
 * Stamps signatures onto a document.
 *
 * Draws onto the existing pages, like addPageNumbers and watermark and for the
 * same reason — copyPages into a fresh document drops bookmarks, links, and form
 * fields. On a signed contract that matters more than on anything else this
 * pipeline touches: an agreement that loses its form fields on the way to being
 * signed is worse than an unsigned one.
 *
 * `placements` arrives already resolved by the client, each entry naming a page,
 * a normalised display-space rect, and which signature asset it draws. Resolving
 * it there means the preview and the output are computed by the same function
 * (placementToPdfRect) rather than two that drift.
 *
 * **This is not a cryptographic signature.** It draws an image or text onto the
 * page — there is no certificate, no key, and no tamper-evident hash, and the
 * tool's copy says so plainly rather than letting someone infer otherwise. A
 * PKCS#7 signature would need a certificate authority and a private key, neither
 * of which a browser tool can honestly offer.
 */
async function sign({ bytes, placements, assets }) {
  const pdf = await loadPdf(bytes);
  const pages = pdf.getPages();

  // Assets are embedded once each, up front, rather than per placement. pdf-lib
  // deduplicates fonts but NOT images, so embedding inside the loop would put a
  // full copy of the signature PNG in the file for every place it appears — an
  // initial on all forty pages of a contract would be forty copies of the same
  // bitmap.
  const embedded = new Map();

  for (const asset of assets || []) {
    if (asset.kind === "image") {
      embedded.set(
        asset.id,
        asset.embedAs === "jpg"
          ? { kind: "image", image: await pdf.embedJpg(asset.bytes) }
          : { kind: "image", image: await pdf.embedPng(asset.bytes) }
      );
    } else {
      // A typed signature. The face resolves to one of pdf-lib's 14 standard
      // fonts, so nothing is added to the file size — see pdfSignature.js on why
      // a real handwriting face isn't offered.
      const face = findTypeFace(asset.faceId);
      embedded.set(asset.id, {
        kind: "text",
        text: asset.text,
        font: await pdf.embedFont(StandardFonts[face.pdfFont] || StandardFonts.TimesRomanItalic),
        colorId: asset.colorId,
      });
    }
  }

  let signedCount = 0;
  const signedPages = new Set();

  for (const placement of placements || []) {
    const page = pages[placement.pageIndex];
    // A stale placement (file re-selected mid-edit) would throw on the next
    // line. Skipping omits one signature rather than failing the whole run.
    if (!page) continue;

    const asset = embedded.get(placement.assetId);
    if (!asset) continue;

    // The CropBox, not the MediaBox: that is what a reader displays and what the
    // user dragged against, so on a page cropped once the MediaBox describes
    // edges that are no longer visible and the signature would land off-screen.
    const box = page.getCropBox();
    const pageRotation = page.getRotation().angle;

    const pdfRect = placementToPdfRect(placement.rect, box, pageRotation);
    // pdf-lib rotates about the origin, not the box centre, so the origin is
    // walked to the corner the rotation sweeps from — without this a signature
    // on a rotated page swings off the placement entirely.
    const origin = drawOriginFor(pdfRect);

    if (asset.kind === "image") {
      page.drawImage(asset.image, {
        x: origin.x,
        y: origin.y,
        width: pdfRect.width,
        height: pdfRect.height,
        rotate: degrees(pdfRect.rotate),
      });
    } else {
      // The size is solved against BOTH dimensions and the smaller wins, which
      // is what "fit this text in that box" means. Solving from the height alone
      // is wrong and fails silently: the client sizes a typed placement from a
      // guessed aspect (character count, since measuring properly would mean
      // loading pdf-lib into the page bundle), and a guess that is narrower than
      // the real metrics lets the text run past the box the user dragged. A
      // fourteen-character name overflows by about 20% in every offered face —
      // enough to sit outside the signature line, with nothing reporting it.
      //
      // Both probes are taken at size 100 and scaled: heightAtSize and
      // widthOfTextAtSize are each linear in the size, so one probe per axis
      // gives the ratio exactly.
      const heightProbe = asset.font.heightAtSize(100);
      const widthProbe = asset.font.widthOfTextAtSize(asset.text, 100);

      const sizeForHeight = heightProbe > 0 ? (pdfRect.height / heightProbe) * 100 : pdfRect.height;
      const sizeForWidth = widthProbe > 0 ? (pdfRect.width / widthProbe) * 100 : sizeForHeight;
      const fontSize = Math.min(sizeForHeight, sizeForWidth);

      // Centred horizontally in the box. Once the width constrains the size, the
      // text no longer fills the box's width, and left-aligning it would park a
      // short name against the box's left edge rather than where it was placed.
      const drawnWidth = widthProbe > 0 ? (widthProbe / 100) * fontSize : pdfRect.width;
      const inset = Math.max(0, (pdfRect.width - drawnWidth) / 2);

      const { r, g, b } = signatureHexToRgb01(findInkColor(asset.colorId).hex);

      // Both offsets are applied as VECTORS along the text's own rotated axes,
      // not added to x and y directly. On a quarter-turned page the text's "up"
      // is the page's left or right, so adding the baseline gap to y would push
      // the signature sideways out of its box on exactly the rotated pages the
      // rest of this pipeline works so hard to get right.
      //
      // Text is positioned from its BASELINE, not its bottom edge, so drawing at
      // the box's foot would sink the descenders below the placement the user
      // saw. 0.22 of the size is roughly where the baseline sits within these
      // faces' full height.
      const baselineGap = fontSize * 0.22;
      const angle = pdfRect.rotate;
      const radians = (angle * Math.PI) / 180;
      const cos = Math.cos(radians);
      const sin = Math.sin(radians);

      // Local (inset, baselineGap) rotated into user space.
      const offsetX = inset * cos - baselineGap * sin;
      const offsetY = inset * sin + baselineGap * cos;

      page.drawText(asset.text, {
        x: origin.x + offsetX,
        y: origin.y + offsetY,
        size: fontSize,
        font: asset.font,
        color: rgb(r, g, b),
        rotate: degrees(angle),
      });
    }

    signedCount++;
    signedPages.add(placement.pageIndex);
  }

  const out = await pdf.save({ useObjectStreams: true });
  return {
    message: {
      bytes: out.buffer,
      pageCount: pages.length,
      signedCount,
      signedPageCount: signedPages.size,
    },
    transfer: [out.buffer],
  };
}

// ── Encryption ───────────────────────────────────────────────────────────────
//
// The two encryption ops are the only place in this worker that must NOT go
// through loadPdf(): that helper passes `ignoreEncryption: true`, which is right
// for every other tool (it lets an owner-password file be edited, as every
// reader does) and exactly wrong here. Unlock needs the library to actually
// derive the key from the user's password, and it can only do that when it is
// allowed to treat the document as encrypted.

/**
 * Rebuilds a decrypted document into a brand-new one.
 *
 * This is the load-bearing part of Unlock PDF, and it is not the obvious
 * implementation. `PDFDocument.load(bytes, { password }).save()` looks correct
 * and even reloads without a password — but @cantoo's save() preserves the
 * source file's bytes and appends to them, so the output still opens with the
 * original document and still carries `/Encrypt` in its trailer. Readers that
 * trust that declaration prompt for a password that no longer opens anything.
 *
 * `save({ rewrite: true })`, `useObjectStreams: false`, deleting the orphaned
 * security dictionary, and clearing `context.trailerInfo.Encrypt` were each
 * measured and each still emitted `/Encrypt`. Copying the pages into a fresh
 * document — whose context never had encryption — is the only route that
 * produces genuinely clean bytes.
 *
 * The cost is the one CLAUDE.md warns about: copyPages drops everything hanging
 * off the catalog rather than off a page. So the catalog entries are carried
 * across explicitly with PDFObjectCopier (see PRESERVED_CATALOG_KEYS), which is
 * what keeps a fillable form fillable instead of returning a flat picture of it.
 */
async function rebuildWithoutEncryption(src) {
  const out = await PDFDocument.create();

  const pages = await out.copyPages(src, src.getPageIndices());
  pages.forEach((page) => out.addPage(page));

  const copier = PDFObjectCopier.for(src.context, out.context);
  for (const key of PRESERVED_CATALOG_KEYS) {
    const ref = src.catalog.get(PDFName.of(key));
    // copy() returns a ref already registered in the destination context, so it
    // is set directly rather than registered a second time.
    if (ref) out.catalog.set(PDFName.of(key), copier.copy(ref));
  }

  return out;
}

/**
 * Reports whether a document is encrypted and whether it needs a password.
 *
 * Both tools need this before doing anything, and the two cases lead to
 * completely different UI:
 *
 *   - `needsPassword` — a user password. Nothing can be read without it, so the
 *     tool must ask before it can even count the pages.
 *   - encrypted but openable — an owner password only. The content was never
 *     encrypted against reading, which is why every reader opens it silently.
 *     Unlock can strip it with no password at all, and saying so is more useful
 *     than implying a feat was performed.
 */
async function inspectEncryption({ bytes, password }) {
  // Attempted WITHOUT ignoreEncryption, so a user-password file throws here
  // rather than loading half-readable.
  try {
    const pdf = await PDFDocument.load(bytes, password ? { password } : undefined);
    return {
      message: {
        encrypted: Boolean(pdf.context?.isDecrypted) || false,
        needsPassword: false,
        pageCount: pdf.getPageCount(),
      },
      transfer: [],
    };
  } catch (error) {
    const message = String(error?.message || error).toLowerCase();

    // The library's own guard for "encrypted, and you gave me nothing usable".
    if (message.includes("is encrypted") || message.includes("password")) {
      return {
        message: { encrypted: true, needsPassword: true, pageCount: null },
        transfer: [],
      };
    }

    throw error;
  }
}

/**
 * Removes encryption from a document the user can already open.
 *
 * `password` may be an empty string: that is the owner-password-only case, where
 * the content is not encrypted against reading and no password is required to
 * strip the restrictions.
 */
async function unlock({ bytes, password }) {
  // No ignoreEncryption — the whole point is to make the library derive the key.
  const src = await PDFDocument.load(bytes, { password: password || "" });

  const hadEncryption = Boolean(src.context?.isDecrypted);
  const out = await rebuildWithoutEncryption(src);

  const result = await out.save({ useObjectStreams: true });
  return {
    message: {
      bytes: result.buffer,
      pageCount: out.getPageCount(),
      hadEncryption,
    },
    transfer: [result.buffer],
  };
}

/**
 * Applies password protection and/or permission restrictions.
 *
 * The document is rebuilt first, for a reason that only shows up on a file that
 * was ALREADY encrypted: re-encrypting in place would append to bytes that still
 * carry the previous /Encrypt dictionary, leaving two security dictionaries in
 * one file and readers disagreeing about which applies. Rebuilding first means
 * this always writes onto a clean document, whether the input was protected or
 * not.
 *
 * `userPassword` may be empty — that is the "restrict, but let anyone open it"
 * case. `ownerPassword` is what guards the restrictions themselves; without a
 * distinct one the permissions could be lifted by anyone who can open the file.
 */
async function protect({ bytes, password, userPassword, ownerPassword, permissions }) {
  // The document may itself be encrypted (someone changing an existing
  // password), so it is opened with whatever the user supplied for it.
  const src = await PDFDocument.load(bytes, { password: password || "" });
  const out = await rebuildWithoutEncryption(src);

  out.encrypt({
    // Empty strings are omitted rather than passed: pdf-lib treats a present
    // empty userPassword as "no password needed to open", which is what we want,
    // but being explicit keeps the two cases from depending on that behaviour.
    ...(userPassword ? { userPassword } : {}),
    ...(ownerPassword ? { ownerPassword } : {}),
    permissions: toSecurityPermissions(permissions || {}),
  });

  const result = await out.save({ useObjectStreams: true });
  return {
    message: {
      bytes: result.buffer,
      pageCount: out.getPageCount(),
    },
    transfer: [result.buffer],
  };
}
