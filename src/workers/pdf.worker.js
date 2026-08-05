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

import { PDFDocument, degrees } from "pdf-lib";
import { ops, replies, createProgress } from "@/lib/pdfWorkerProtocol";

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
