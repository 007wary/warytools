// Acceptance rules and error mapping for the Word-to-PDF converter.
//
// The site's *second* tool that uploads, and the reasoning is the mirror image
// of pdfToWordLimits.js: rendering a .docx to PDF means laying out a Word
// document — styles, sections, headers/footers, tables, fonts, pagination —
// and a browser has no Word layout engine. So the file goes to a LibreOffice
// container (see services/word-to-pdf/).
//
// Note this is the one direction where LibreOffice is the *right* answer.
// services/pdf-to-word/README.md explains at length why it was removed from
// the PDF->DOCX path; that was a flaw in its PDF *import* (positioned
// textboxes instead of flowing paragraphs). Rendering DOCX *out* to PDF is its
// native strength — it's the same layout engine Writer uses on screen, and PDF
// is just its print target.
//
// Per CLAUDE.md, guard logic lives in src/lib/ rather than inline in the
// client so it can actually be tested. Both the client and the API route
// import from here; the route is the one that counts, since the client's copy
// is bypassable by anyone posting directly.

/**
 * Hard ceiling on an uploaded document.
 *
 * Deliberately the same 20 MB as the PDF-to-Word path, and not because the
 * formats are similar — they aren't. It's because both limits answer the same
 * question ("what can a shared container render without starving other
 * requests"), and a user who has used one tool should not have to learn a
 * second number for the other.
 *
 * 20 MB is generous for this direction in practice: a .docx is a ZIP, so the
 * text of even a long report is tiny and the byte count is almost entirely
 * embedded images.
 */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB

/**
 * Files above this convert fine but slowly enough that a user with no warning
 * assumes the tool has hung. Surfaced as a caution, not a rejection.
 */
export const SLOW_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * How long to let a conversion run before giving up on it.
 *
 * Matched to the container's own soffice timeout. If these drift apart the
 * user-facing failure gets worse, not better: a route that gives up first
 * leaves a process still burning CPU with nobody waiting for the result.
 */
export const CONVERSION_TIMEOUT_MS = 60_000;

/**
 * How long the browser waits before giving up on the request entirely.
 *
 * Same layering as the PDF-to-Word client: this is deliberately the longest
 * timeout in the chain, because every layer below it (container 55s, route
 * 60s, Vercel 90s) produces a real response the user can act on. This one
 * exists only for the case where none of them get to reply — a connection that
 * stalls mid-upload, which is ordinary on mobile.
 *
 * It must stay strictly greater than the route's maxDuration, or it would
 * abort conversions that were about to succeed and report a timeout that never
 * happened.
 */
export const CLIENT_TIMEOUT_MS = 120_000;

/**
 * Formats this tool accepts, keyed by the extension users actually have.
 *
 * `.doc` is included deliberately even though it is a dead format: it is
 * exactly the format people still have lying around and cannot open, which is
 * the whole reason they are looking for a converter. LibreOffice reads it
 * natively, so supporting it costs nothing beyond this entry.
 *
 * `.odt` and `.rtf` come free from the same engine. They are not advertised
 * heavily in the copy (nobody searches for them at volume) but accepting them
 * is strictly better than refusing a file the converter would have handled.
 */
export const ACCEPTED_EXTENSIONS = [".docx", ".doc", ".odt", ".rtf"];

/**
 * The `accept` attribute for the file picker.
 *
 * Both the MIME types and the extensions are listed, for the same reason
 * pdfFile.js does not trust `file.type`: the extension is what makes the
 * picker behave on the platforms whose MIME registry is empty or wrong.
 */
export const ACCEPT_ATTRIBUTE = [
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.oasis.opendocument.text",
  "application/rtf",
  ...ACCEPTED_EXTENSIONS,
].join(",");

/**
 * Checks an upload's size before any bytes are read or forwarded.
 *
 * Size-only, because that's all the API route can cheaply know about a
 * streamed body. The magic-byte check lives in docxFile.js — the route runs
 * that logic too, but the ordering matters: size first, since refusing a
 * 200 MB body must not require reading it.
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
      return `This tool converts documents up to ${formatLimit(MAX_UPLOAD_BYTES)}. Larger files take too long on a shared converter — try removing or shrinking embedded images first.`;
    case "not_a_document":
      return "That file isn't a Word document. Choose a .docx, .doc, .odt, or .rtf file.";
    case "unreadable":
      return "This document appears to be damaged and couldn't be read. Try re-saving it from Word, Google Docs, or LibreOffice.";
    case "encrypted":
      return "This document is password-protected. Open it in Word, remove the password, then try again.";
    case "no_content":
      return "This document has no content to convert. It may be damaged — try re-saving it from the app that created it.";
    case "unavailable":
      return "The converter is temporarily unavailable. Please try again in a few minutes.";
    case "timeout":
      return "This document took too long to convert. Very long or image-heavy documents can exceed the time limit — try splitting it into smaller files.";
    case "rate_limited":
      return "You've converted several files just now. Please wait a minute and try again.";
    default:
      return "Could not convert this document. Please try again.";
  }
}

/**
 * Builds the output filename from the source.
 *
 * Strips any of the accepted extensions case-insensitively and falls back to a
 * generic name, so "Report.DOCX" downloads as "Report.pdf" rather than
 * "Report.DOCX.pdf" and a file with no extension still gets a sensible name.
 *
 * @param {string} sourceName
 * @returns {string}
 */
export function pdfFilename(sourceName) {
  const base = String(sourceName || "")
    .replace(/\.(docx|doc|odt|rtf)$/i, "")
    .trim();
  if (!base) return "converted.pdf";
  return `${base}.pdf`;
}

function formatLimit(bytes) {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}
