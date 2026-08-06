// File-acceptance rules for the PowerPoint-to-PDF tool.
//
// Same principle as pdfFile.js, imageValidation.js, and docxFile.js: `File.type`
// comes from the OS mime registry rather than the bytes, so it is a hint and
// never the decision. A machine without Office installed routinely reports an
// empty string for a perfectly good .pptx, and .ppsx has its own separate MIME
// type that plenty of registries simply don't carry.
//
// Like a .docx, **a .pptx has no signature of its own** — it is a ZIP, so it
// starts with "PK\x03\x04" exactly like a .docx, .xlsx, .odp, .jar, or .epub.
// So for ZIP-based formats we read a little further and look for the entry
// paths that identify the *kind* of document, which is cheap because they sit
// uncompressed in the archive's local file headers near the front.
//
// **The one real difference from docxFile.js**, and the reason this is a
// separate module rather than a parameter on that one: the legacy binary
// formats are indistinguishable by magic bytes. A .doc, a .ppt, and a .xls are
// all OLE2 compound files with the identical D0 CF 11 E0 header, and telling
// them apart for real means walking the compound-file directory to find the
// stream name ("PowerPoint Document" vs "WordDocument"). That is a real parser,
// not a sniff. So for OLE2 we fall back to the filename extension and let
// LibreOffice be the authority — see detectPresentationFormat.
//
// The container families we accept:
//   - OOXML (.pptx, .ppsx) — ZIP; identified by "ppt/" in the entry names
//   - OLE2  (.ppt, .pps)   — compound file, magic D0 CF 11 E0, extension-disambiguated
//   - ODF   (.odp)         — ZIP; identified by its opendocument.presentation mimetype entry

import { MAX_UPLOAD_BYTES } from "./powerPointToPdfLimits";

/** ZIP local file header: "PK\x03\x04". Shared by .pptx, .odp, and every other ZIP. */
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

/** OLE2 / Compound File Binary Format: legacy .ppt — and also .doc and .xls. */
const OLE2_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

// How far into a ZIP to look for the entry names that identify the format.
//
// Matches docxFile.js. A .pptx written by PowerPoint puts "[Content_Types].xml"
// first and the "ppt/" entries within the first few hundred bytes. 4 KB is
// generous enough to cover archives whose entries are ordered unusually (Google
// Slides exports, python-pptx) while still being a single cheap Blob.slice
// rather than a full read.
const ZIP_SCAN_BYTES = 4096;

/**
 * The distinctive substrings we look for inside a ZIP's header region.
 *
 * These are entry *paths*, stored uncompressed in each local file header, so
 * they appear as literal ASCII in the raw bytes — no unzipping required.
 */
const ZIP_MARKERS = {
  // Every OOXML presentation has a ppt/ directory, whether it was saved as
  // .pptx or .ppsx — the two differ only in their content-type declaration and
  // in how PowerPoint opens them, not in their structure.
  pptx: ["ppt/"],
  // ODF stores its type in an uncompressed "mimetype" entry placed first by
  // spec, so this string is literally present near byte 38.
  odp: ["opendocument.presentation"],
  // Present so a document or spreadsheet can be told apart from a deck and
  // refused with an accurate message rather than a converter error.
  docx: ["word/"],
  xlsx: ["xl/"],
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

/** Legacy PowerPoint extensions, used to disambiguate the shared OLE2 header. */
const OLE2_PRESENTATION_EXTENSIONS = [".ppt", ".pps"];

/**
 * Identifies a presentation container from its leading bytes.
 *
 * Returns a format tag the caller can act on rather than a bare boolean, so
 * "this is a spreadsheet" and "this is not a document at all" can be given
 * different messages — the same reason describePdfError exists.
 *
 * `filename` is consulted for **OLE2 files only**, and only because the format
 * genuinely cannot be resolved from the header (see the note at the top of this
 * file). Everywhere else the bytes decide and the name is ignored, which is the
 * rule the rest of the codebase follows.
 *
 * @param {Uint8Array} bytes    First bytes of a candidate file (at least ZIP_SCAN_BYTES).
 * @param {string} [filename]   Original name, used only to disambiguate OLE2.
 * @returns {"pptx"|"ppt"|"odp"|"docx"|"xlsx"|"ole2"|"zip"|"unknown"}
 */
export function detectPresentationFormat(bytes, filename = "") {
  if (!bytes || typeof bytes.length !== "number" || bytes.length === 0) {
    return "unknown";
  }

  if (startsWith(bytes, OLE2_MAGIC)) {
    // A legacy Office binary. Which application wrote it is not recoverable
    // from the header, so the extension is the only cheap signal. An
    // unrecognised one returns "ole2" and the caller decides — refusing
    // outright would reject a .ppt that arrived with no extension, which the
    // converter would have handled fine.
    const name = String(filename || "").toLowerCase();
    if (OLE2_PRESENTATION_EXTENSIONS.some((extension) => name.endsWith(extension))) {
      return "ppt";
    }
    return "ole2";
  }

  if (startsWith(bytes, ZIP_MAGIC)) {
    // Order matters: check the formats we accept before the ones we reject, so
    // a deck that embeds a chart (and therefore carries an "xl/" entry for the
    // embedded workbook) is still recognised as a presentation.
    if (ZIP_MARKERS.pptx.some((marker) => containsAscii(bytes, marker))) return "pptx";
    if (ZIP_MARKERS.odp.some((marker) => containsAscii(bytes, marker))) return "odp";
    if (ZIP_MARKERS.docx.some((marker) => containsAscii(bytes, marker))) return "docx";
    if (ZIP_MARKERS.xlsx.some((marker) => containsAscii(bytes, marker))) return "xlsx";

    // A ZIP we could not identify. Might still be a .pptx whose entries are
    // ordered so unusually that "ppt/" fell outside the scan window, so the
    // caller decides whether to trust it — see validatePresentationFile.
    return "zip";
  }

  return "unknown";
}

/** Formats the converter accepts, as returned by detectPresentationFormat. */
const CONVERTIBLE = new Set(["pptx", "ppt", "odp"]);

/**
 * Cheap pre-check on metadata alone, before any bytes are read.
 *
 * Deliberately permissive about the mime type, for the reasons in pdfFile.js.
 * The extension carries more weight here than it does for PDFs, because it is
 * the only signal that distinguishes the ZIP-based formats before we read them
 * (and the only one at all for OLE2) — but it is still used to *reject*
 * confidently wrong files, never as the sole reason to accept one.
 *
 * @param {File} file
 * @returns {{ok: true} | {ok: false, error: string}}
 */
export function checkPresentationMetadata(file) {
  if (!file) {
    return { ok: false, error: "No file was selected." };
  }

  if (file.size === 0) {
    return { ok: false, error: "That file is empty (0 bytes). Try choosing it again." };
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      error: `That presentation is larger than the ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB limit. Conversion runs on a shared server, so very large files would hold it up for everyone. Decks are usually large because of images — try File → Compress Pictures in PowerPoint.`,
    };
  }

  // A PDF is a likely wrong file here, because the tool sits in the PDF section
  // alongside tools that all want one. Naming it — and being straight that the
  // reverse conversion isn't offered — beats a generic rejection that leaves
  // someone hunting for a tool that doesn't exist.
  const name = (file.name || "").toLowerCase();
  if (name.endsWith(".pdf")) {
    return {
      ok: false,
      error: "That's a PDF, not a PowerPoint presentation. This tool converts decks into PDFs; it doesn't convert them back.",
    };
  }

  if (name.endsWith(".key")) {
    return {
      ok: false,
      error: "Apple Keynote presentations aren't supported. Open it in Keynote and export as PowerPoint (.pptx) first.",
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
export async function validatePresentationFile(file) {
  const meta = checkPresentationMetadata(file);
  if (!meta.ok) return meta;

  let header;
  try {
    const slice = file.slice(0, ZIP_SCAN_BYTES);
    header = new Uint8Array(await slice.arrayBuffer());
  } catch {
    // Happens when a file is moved/deleted between the picker and the read,
    // or on a permission-revoked handle. Worth its own message: retrying
    // genuinely fixes it, unlike a malformed-presentation error.
    return { ok: false, error: "Could not read that file. It may have been moved or deleted." };
  }

  const format = detectPresentationFormat(header, file.name);

  if (CONVERTIBLE.has(format)) {
    return { ok: true, file, format, isLarge: file.size > 3 * 1024 * 1024 };
  }

  // Named formats get named errors. A user who picked the wrong file out of a
  // folder needs to know *which* wrong file it was.
  if (format === "docx") {
    return {
      ok: false,
      error: "That's a Word document, not a presentation. Use the Word to PDF tool for that.",
    };
  }
  if (format === "xlsx") {
    return {
      ok: false,
      error: "That's an Excel spreadsheet, not a presentation. This tool converts .pptx, .ppt, .ppsx, and .odp files.",
    };
  }

  // A legacy Office binary whose extension didn't identify it. It is as likely
  // to be a .doc or .xls as a .ppt, and forwarding it would spend a container
  // slot to produce a PDF of the wrong kind of file — or a failure the user
  // can't interpret. Naming the ambiguity is more useful than either.
  if (format === "ole2") {
    return {
      ok: false,
      error: "That's an older Microsoft Office file, but its name doesn't say which kind. Rename it with a .ppt extension if it's a presentation, then try again.",
    };
  }

  // An unrecognised ZIP. If the extension says .pptx we let it through rather
  // than refuse: the scan window is a heuristic, and a false rejection blocks a
  // file the converter would have handled, while a false acceptance costs one
  // failed conversion with an accurate error. The converter is the authority on
  // whether it can read the file — this check exists to catch obvious mistakes
  // cheaply, not to be the final word.
  if (format === "zip") {
    const name = (file.name || "").toLowerCase();
    if (name.endsWith(".pptx") || name.endsWith(".ppsx") || name.endsWith(".odp")) {
      return { ok: true, file, format: "pptx", isLarge: file.size > 3 * 1024 * 1024 };
    }
    return {
      ok: false,
      error: "That looks like a ZIP archive rather than a presentation. If it contains one, extract it first and choose the .pptx file.",
    };
  }

  return {
    ok: false,
    error: "That file isn't a PowerPoint presentation. Choose a .pptx, .ppt, .ppsx, or .odp file.",
  };
}

/**
 * Maps a converter failure onto something a user can act on.
 *
 * Mirrors describeDocumentError. The generic fallback is the failure mode to
 * avoid: a password-protected deck and a corrupt one need completely different
 * responses, and "conversion failed" addresses neither.
 *
 * @param {unknown} error   The thrown error.
 * @param {string} fallback Message when the cause isn't recognised.
 * @returns {string}
 */
export function describePresentationError(
  error,
  fallback = "Something went wrong converting this presentation."
) {
  const message = String(error?.message || error || "").toLowerCase();

  if (message.includes("password") || message.includes("encrypted")) {
    return "This presentation is password-protected. Open it in PowerPoint, remove the password, then try again.";
  }

  if (
    message.includes("corrupt") ||
    message.includes("damaged") ||
    message.includes("parse") ||
    message.includes("invalid")
  ) {
    return "This presentation appears to be damaged and couldn't be read. Try re-saving it from PowerPoint, Google Slides, or LibreOffice.";
  }

  return fallback;
}
