// Acceptance rules and error mapping for the PDF-to-Word converter.
//
// This tool is the one exception to the site's "nothing is uploaded" rule:
// reconstructing a DOCX means real layout analysis, which no browser library
// does, so the file goes to a LibreOffice container we run (see
// services/pdf-to-word/). That makes the limits here load-bearing in a way the
// client-side tools' aren't — every accepted file costs CPU on a machine we
// pay for, and every rejected one costs nothing. Rejecting early and cheaply
// is the whole point.
//
// Per CLAUDE.md, guard logic lives in src/lib/ rather than inline in the
// client so it can actually be tested. Both the client and the API route
// import from here; the route is the one that counts, since the client's copy
// is bypassable by anyone posting directly.

/**
 * Hard ceiling on an uploaded PDF.
 *
 * Much lower than MAX_PDF_BYTES (100 MB) in pdfFile.js, and deliberately so:
 * that limit is about what a browser tab can hold in memory, while this one is
 * about what a shared container can convert without starving other requests.
 * LibreOffice's memory use scales with page complexity, not just byte count,
 * so this is the conservative end.
 */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB

/**
 * Files above this convert fine but slowly enough that a user with no warning
 * assumes the tool has hung. Surfaced as a caution, not a rejection.
 */
export const SLOW_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Page ceiling, checked client-side after the existing INSPECT worker op.
 *
 * A 500-page document can hold the converter for minutes. The page count is
 * free for us to read (pdf-lib already parses the file for the page header),
 * so it's a cheap second axis of protection beyond byte size — a 3 MB file
 * with 900 sparse pages passes the size check and would still be abusive.
 */
export const MAX_PAGES = 200;

/**
 * How long to let a conversion run before giving up on it.
 *
 * Matched to the container's own soffice timeout. If these drift apart the
 * user-facing failure gets worse, not better: a route that gives up first
 * leaves a process still burning CPU with nobody waiting for the result.
 */
export const CONVERSION_TIMEOUT_MS = 60_000;

/**
 * Checks an upload's size before any bytes are read or forwarded.
 *
 * Size-only, because that's all the API route can cheaply know about a
 * streamed body. The magic-byte check stays in pdfFile.js — the route runs
 * validatePdfFile's logic too, but the ordering matters: size first, since
 * refusing a 200 MB body must not require reading it.
 *
 * @param {number} size Byte length of the upload.
 * @returns {{ok: true, isSlow: boolean} | {ok: false, reason: string}}
 */
export function checkUploadSize(size) {
  if (!Number.isFinite(size) || size <= 0) {
    return { ok: false, reason: "empty" };
  }

  if (size > MAX_UPLOAD_BYTES) {
    return { ok: false, reason: "too_large" };
  }

  return { ok: true, isSlow: size > SLOW_UPLOAD_BYTES };
}

/**
 * Checks a document's page count once it's known.
 *
 * @param {number} pageCount
 * @returns {{ok: true} | {ok: false, reason: string}}
 */
export function checkPageCount(pageCount) {
  // Zero or unreadable page counts mean the inspect step failed, which is a
  // damaged file rather than an oversized one — a different message entirely.
  if (!Number.isFinite(pageCount) || pageCount <= 0) {
    return { ok: false, reason: "unreadable" };
  }

  if (pageCount > MAX_PAGES) {
    return { ok: false, reason: "too_many_pages" };
  }

  return { ok: true };
}

/**
 * True when a PDF carries no extractable text layer.
 *
 * A scanned PDF is a stack of page images. LibreOffice will happily convert it
 * and produce a DOCX containing those same images and not one editable word,
 * which is worse than a refusal — the user pays the upload, the wait, and the
 * download to learn nothing. We detect it client-side (pdf.js already gives us
 * text content for the thumbnail path) and refuse with instructions, the same
 * way imageValidation.js handles HEIC.
 *
 * The threshold is deliberately not zero: real scans often carry a few stray
 * characters from a header stamp or a digital signature annotation, and a
 * strict `=== 0` test would let those through as "has text".
 *
 * @param {string[]} pageTexts Extracted text, one entry per sampled page.
 * @returns {boolean}
 */
export function looksScanned(pageTexts) {
  if (!Array.isArray(pageTexts) || pageTexts.length === 0) return false;

  const totalChars = pageTexts.reduce(
    (sum, text) => sum + String(text || "").trim().length,
    0
  );

  // A flat per-page average was wrong: it scaled the requirement with the
  // sample size, so a one-page invoice reading "Invoice 2026" was called a
  // scan and refused, while the same header across three pages passed. The
  // question is whether the document contains *any* real text, so this is an
  // absolute floor — a scan yields near-zero characters regardless of how
  // many pages are sampled.
  //
  // 25 is deliberately low. A false "this is a scan" blocks a document the
  // tool could have converted, which is far worse than letting a nearly-empty
  // PDF through and producing a nearly-empty .docx.
  return totalChars < 25;
}

/**
 * Maps a rejection reason onto user-facing copy.
 *
 * Kept beside the checks rather than in the client so the API route and the UI
 * can never disagree about what a given reason means.
 *
 * @param {string} reason
 * @returns {string}
 */
export function rejectionMessage(reason) {
  switch (reason) {
    case "empty":
      return "That file is empty (0 bytes). Try choosing it again.";
    case "too_large":
      return `This tool converts PDFs up to ${formatLimit(MAX_UPLOAD_BYTES)}. Larger files take too long on a shared converter — try splitting the PDF first.`;
    case "too_many_pages":
      return `This tool converts PDFs up to ${MAX_PAGES} pages. Split the document and convert it in parts.`;
    case "unreadable":
      return "This PDF appears to be damaged and couldn't be read. Try re-exporting it from the app that created it.";
    case "scanned":
      return "This PDF is a scan — it contains page images, not text, so there's nothing to convert into editable Word content. You'd need OCR software to extract the text first.";
    case "unavailable":
      return "The converter is temporarily unavailable. Please try again in a few minutes.";
    case "timeout":
      return "This PDF took too long to convert. Very complex or image-heavy documents can exceed the time limit — try splitting it into smaller files.";
    case "rate_limited":
      return "You've converted several files just now. Please wait a minute and try again.";
    default:
      return "Could not convert this PDF. Please try again.";
  }
}

/**
 * Builds the output filename from the source.
 *
 * Strips a trailing .pdf case-insensitively and falls back to a generic name,
 * so a file called "report.PDF" doesn't download as "report.PDF.docx" and one
 * with no extension still gets a sensible name.
 *
 * @param {string} sourceName
 * @returns {string}
 */
export function docxFilename(sourceName) {
  const base = String(sourceName || "").replace(/\.pdf$/i, "").trim();
  if (!base) return "converted.docx";
  return `${base}.docx`;
}

function formatLimit(bytes) {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}
