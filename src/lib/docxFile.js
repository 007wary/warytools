// File-acceptance rules for the Word-to-PDF tool.
//
// Same principle as pdfFile.js and imageValidation.js: `File.type` comes from
// the OS mime registry rather than the bytes, so it is a hint and never the
// decision. It is even less trustworthy here than for PDFs — Word's MIME types
// are long, there are four of them, and a machine without Office installed
// routinely reports an empty string for a perfectly good .docx.
//
// The complication this file exists to handle: **a .docx has no signature of
// its own.** It is a ZIP archive, so it starts with "PK\x03\x04" — exactly
// like a .zip, .xlsx, .pptx, .odt, .jar, or .epub. Sniffing the first four
// bytes therefore proves only "this is a ZIP", which would let someone upload
// a spreadsheet, a slide deck, or a renamed archive and get a generic
// converter failure back instead of an answer. So for ZIP-based formats we
// read a little further and look for the part that identifies the *kind* of
// document, which is cheap because it sits in the archive's local file headers
// near the front.
//
// The three container families we accept:
//   - OOXML  (.docx) — ZIP; identified by "word/" appearing in the entry names
//   - OLE2   (.doc)  — the old compound-file format, magic D0 CF 11 E0
//   - ODF    (.odt)  — ZIP; identified by its opendocument.text mimetype entry
//   - RTF    (.rtf)  — plain text, starts with "{\rtf"

import { MAX_UPLOAD_BYTES } from "./wordToPdfLimits";

/** ZIP local file header: "PK\x03\x04". Shared by .docx, .odt, and every other ZIP. */
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

/** OLE2 / Compound File Binary Format: legacy .doc (also .xls, .ppt). */
const OLE2_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

/** RTF documents are plain text beginning with "{\rtf". */
const RTF_MAGIC = [0x7b, 0x5c, 0x72, 0x74, 0x66];

// How far into a ZIP to look for the entry names that identify the format.
//
// A .docx written by Word puts "[Content_Types].xml" first and the "word/"
// entries within the first few hundred bytes. 4 KB is generous enough to cover
// archives whose entries are ordered unusually (Google Docs exports, python-docx)
// while still being a single cheap Blob.slice rather than a full read.
const ZIP_SCAN_BYTES = 4096;

/**
 * The distinctive substrings we look for inside a ZIP's header region.
 *
 * These are entry *paths*, stored uncompressed in each local file header, so
 * they appear as literal ASCII in the raw bytes — no unzipping required.
 */
const ZIP_MARKERS = {
  // Every OOXML word processing document has a word/ directory. Checking for
  // "word/document.xml" specifically would be tighter but fails on files whose
  // first word/ entry is styles or numbering.
  docx: ["word/"],
  // ODF stores its type in an uncompressed "mimetype" entry placed first by
  // spec, so this string is literally present near byte 38.
  odt: ["opendocument.text"],
  // Present so a spreadsheet or deck can be told apart from a Word file and
  // refused with an accurate message rather than a converter error.
  xlsx: ["xl/"],
  pptx: ["ppt/"],
};

function startsWith(bytes, signature) {
  if (!bytes || bytes.length < signature.length) return false;
  for (let i = 0; i < signature.length; i++) {
    if (bytes[i] !== signature[i]) return false;
  }
  return true;
}

/**
 * Searches a byte array for an ASCII substring.
 *
 * Decoding the slice to a string with TextDecoder and using indexOf would be
 * shorter, but the slice is arbitrary binary (compressed entry data) and
 * decoding it as UTF-8 mangles bytes above 0x7F into replacement characters.
 * Comparing bytes directly avoids depending on how invalid sequences decode.
 */
function containsAscii(bytes, needle) {
  const target = [];
  for (let i = 0; i < needle.length; i++) target.push(needle.charCodeAt(i));

  const limit = bytes.length - target.length;
  for (let start = 0; start <= limit; start++) {
    let matched = true;
    for (let i = 0; i < target.length; i++) {
      if (bytes[start + i] !== target[i]) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }
  return false;
}

/**
 * Identifies a document container from its leading bytes.
 *
 * Returns a format tag the caller can act on rather than a bare boolean, so
 * "this is a spreadsheet" and "this is not a document at all" can be given
 * different messages — the same reason describePdfError exists.
 *
 * @param {Uint8Array} bytes First bytes of a candidate file (at least ZIP_SCAN_BYTES).
 * @returns {"docx"|"doc"|"odt"|"rtf"|"xlsx"|"pptx"|"zip"|"unknown"}
 */
export function detectDocumentFormat(bytes) {
  if (!bytes || typeof bytes.length !== "number" || bytes.length === 0) {
    return "unknown";
  }

  if (startsWith(bytes, OLE2_MAGIC)) return "doc";
  if (startsWith(bytes, RTF_MAGIC)) return "rtf";

  if (startsWith(bytes, ZIP_MAGIC)) {
    // Order matters: check the formats we accept before the ones we reject, so
    // an unusual .docx that happens to embed a chart (and therefore carries an
    // "xl/" entry for the embedded workbook) is still recognised as a document.
    if (ZIP_MARKERS.docx.some((marker) => containsAscii(bytes, marker))) return "docx";
    if (ZIP_MARKERS.odt.some((marker) => containsAscii(bytes, marker))) return "odt";
    if (ZIP_MARKERS.xlsx.some((marker) => containsAscii(bytes, marker))) return "xlsx";
    if (ZIP_MARKERS.pptx.some((marker) => containsAscii(bytes, marker))) return "pptx";

    // A ZIP we could not identify. Might still be a .docx whose entries are
    // ordered so unusually that "word/" fell outside the scan window, so the
    // caller decides whether to trust it — see validateDocumentFile.
    return "zip";
  }

  return "unknown";
}

/** Formats the converter accepts, as returned by detectDocumentFormat. */
const CONVERTIBLE = new Set(["docx", "doc", "odt", "rtf"]);

/**
 * Cheap pre-check on metadata alone, before any bytes are read.
 *
 * Deliberately permissive about the mime type, for the reasons in pdfFile.js.
 * The extension carries more weight here than it does for PDFs, because it is
 * the only signal that distinguishes the ZIP-based formats before we read
 * them — but it is still only used to *reject* confidently wrong files, never
 * to accept one.
 *
 * @param {File} file
 * @returns {{ok: true} | {ok: false, error: string}}
 */
export function checkDocumentMetadata(file) {
  if (!file) {
    return { ok: false, error: "No file was selected." };
  }

  if (file.size === 0) {
    return { ok: false, error: "That file is empty (0 bytes). Try choosing it again." };
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      error: `That document is larger than the ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB limit. Conversion runs on a shared server, so very large files would hold it up for everyone — try removing or shrinking embedded images first.`,
    };
  }

  // A PDF is the single most likely wrong file to arrive here, because the
  // tool sits in the PDF section next to five tools that all want one. Saying
  // so by name — and pointing at the tool that does the opposite conversion —
  // is far more useful than "that isn't a Word document".
  const name = (file.name || "").toLowerCase();
  if (name.endsWith(".pdf")) {
    return {
      ok: false,
      error: "That's a PDF, not a Word document. If you want to go the other way, use the PDF to Word tool.",
    };
  }

  if (name.endsWith(".pages")) {
    return {
      ok: false,
      error: "Apple Pages documents aren't supported. Open it in Pages and export as Word (.docx) first.",
    };
  }

  return { ok: true };
}

/**
 * Full acceptance check: metadata, then container sniffing.
 *
 * Reads only the first {@link ZIP_SCAN_BYTES} bytes via `Blob.slice`, so
 * rejecting a wrong file never pays the cost of loading a large one.
 *
 * @param {File} file
 * @returns {Promise<{ok: true, file: File, format: string, isLarge: boolean} | {ok: false, error: string}>}
 */
export async function validateDocumentFile(file) {
  const meta = checkDocumentMetadata(file);
  if (!meta.ok) return meta;

  let header;
  try {
    const slice = file.slice(0, ZIP_SCAN_BYTES);
    header = new Uint8Array(await slice.arrayBuffer());
  } catch {
    // Happens when a file is moved/deleted between the picker and the read,
    // or on a permission-revoked handle. Worth its own message: retrying
    // genuinely fixes it, unlike a malformed-document error.
    return { ok: false, error: "Could not read that file. It may have been moved or deleted." };
  }

  const format = detectDocumentFormat(header);

  if (CONVERTIBLE.has(format)) {
    return { ok: true, file, format, isLarge: file.size > 5 * 1024 * 1024 };
  }

  // Named formats get named errors. A user who picked the wrong file out of a
  // folder needs to know *which* wrong file it was.
  if (format === "xlsx") {
    return { ok: false, error: "That's an Excel spreadsheet, not a Word document. This tool converts .docx, .doc, .odt, and .rtf files." };
  }
  if (format === "pptx") {
    return { ok: false, error: "That's a PowerPoint presentation, not a Word document. This tool converts .docx, .doc, .odt, and .rtf files." };
  }

  // An unrecognised ZIP. If the extension says .docx we let it through rather
  // than refuse: the scan window is a heuristic, and a false rejection blocks
  // a file the converter would have handled, while a false acceptance costs
  // one failed conversion with an accurate error. The converter is the
  // authority on whether it can read the file — this check exists to catch
  // obvious mistakes cheaply, not to be the final word.
  if (format === "zip") {
    const name = (file.name || "").toLowerCase();
    if (name.endsWith(".docx") || name.endsWith(".odt")) {
      return { ok: true, file, format: "docx", isLarge: file.size > 5 * 1024 * 1024 };
    }
    return {
      ok: false,
      error: "That looks like a ZIP archive rather than a Word document. If it contains a document, extract it first and choose the .docx file.",
    };
  }

  return {
    ok: false,
    error: "That file isn't a Word document. Choose a .docx, .doc, .odt, or .rtf file.",
  };
}

/**
 * Maps a converter failure onto something a user can act on.
 *
 * Mirrors describePdfError. The generic fallback is the failure mode to avoid:
 * a password-protected document and a corrupt one need completely different
 * responses, and "conversion failed" addresses neither.
 *
 * @param {unknown} error   The thrown error.
 * @param {string} fallback Message when the cause isn't recognised.
 * @returns {string}
 */
export function describeDocumentError(error, fallback = "Something went wrong converting this document.") {
  const message = String(error?.message || error || "").toLowerCase();

  if (message.includes("password") || message.includes("encrypted")) {
    return "This document is password-protected. Open it in Word, remove the password, then try again.";
  }

  if (
    message.includes("corrupt") ||
    message.includes("damaged") ||
    message.includes("parse") ||
    message.includes("invalid")
  ) {
    return "This document appears to be damaged and couldn't be read. Try re-saving it from Word, Google Docs, or LibreOffice.";
  }

  return fallback;
}
