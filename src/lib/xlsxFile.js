// File-acceptance rules for the Excel-to-PDF tool.
//
// Same principle as pdfFile.js, imageValidation.js, docxFile.js, and
// pptxFile.js: `File.type` comes from the OS mime registry rather than the
// bytes, so it is a hint and never the decision. It is especially unreliable
// for spreadsheets — .xlsx, .xlsm, and .xlsb each have their own MIME type,
// several registries carry none of them, and a machine without Office installed
// routinely reports an empty string for a perfectly good .xlsx.
//
// Like a .docx and a .pptx, **a .xlsx has no signature of its own** — it is a
// ZIP, so it starts with "PK\x03\x04" exactly like a .docx, .pptx, .odt, .jar,
// or .epub. So for ZIP-based formats we read a little further and look for the
// entry paths that identify the *kind* of document, which is cheap because they
// sit uncompressed in the archive's local file headers near the front.
//
// Two things here that neither sibling module has to deal with:
//
//   1. **CSV.** It is by far the most common wrong file for this tool — people
//      reasonably think of it as a spreadsheet — and it has no magic bytes at
//      all, being plain text. It is detected heuristically and refused with its
//      own message explaining why, rather than falling into the generic
//      "not a spreadsheet" bucket that would leave someone stuck. See
//      looksLikeCsv().
//
//   2. **.xlsb.** A binary workbook. It is a ZIP and carries the same "xl/"
//      entries as a .xlsx, so it sniffs as OOXML — but its sheet data is a
//      binary part that LibreOffice reads only partially and often silently
//      renders as blank pages. It is identified specifically and refused, which
//      is the whole reason "looks like a .xlsx" is not sufficient here.
//
// And the same OLE2 problem pptxFile.js documents: a .doc, .ppt, and .xls are
// all OLE2 compound files with the identical D0 CF 11 E0 header, and telling
// them apart for real means walking the compound-file directory for a stream
// name. That is a parser, not a sniff, so for OLE2 we fall back to the filename
// extension — see detectSpreadsheetFormat.
//
// The container families we accept:
//   - OOXML (.xlsx, .xlsm) — ZIP; identified by "xl/" in the entry names
//   - OLE2  (.xls)         — compound file, magic D0 CF 11 E0, extension-disambiguated
//   - ODF   (.ods)         — ZIP; identified by its opendocument.spreadsheet mimetype entry

import { MAX_UPLOAD_BYTES } from "./excelToPdfLimits";

/** ZIP local file header: "PK\x03\x04". Shared by .xlsx, .ods, and every other ZIP. */
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

/** OLE2 / Compound File Binary Format: legacy .xls — and also .doc and .ppt. */
const OLE2_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

// How far into a ZIP to look for the entry names that identify the format.
//
// Matches docxFile.js and pptxFile.js. A .xlsx written by Excel puts
// "[Content_Types].xml" first and the "xl/" entries within the first few
// hundred bytes. 4 KB is generous enough to cover archives whose entries are
// ordered unusually (Google Sheets exports, openpyxl) while still being a
// single cheap Blob.slice rather than a full read.
const ZIP_SCAN_BYTES = 4096;

/**
 * The distinctive substrings we look for inside a ZIP's header region.
 *
 * These are entry *paths*, stored uncompressed in each local file header, so
 * they appear as literal ASCII in the raw bytes — no unzipping required.
 */
const ZIP_MARKERS = {
  // Every OOXML workbook has an xl/ directory, whether saved as .xlsx, .xlsm,
  // or .xlsb — the three differ in their content types and in the format of the
  // sheet parts, not in the directory layout.
  xlsx: ["xl/"],
  // The binary workbook's giveaway. Present as a real entry path in the
  // archive, so it identifies .xlsb without inspecting content types.
  xlsb: ["xl/workbook.bin"],
  // ODF stores its type in an uncompressed "mimetype" entry placed first by
  // spec, so this string is literally present near byte 38.
  ods: ["opendocument.spreadsheet"],
  // Present so a document or presentation can be told apart from a workbook and
  // refused with an accurate message rather than a converter error.
  docx: ["word/"],
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

/** Legacy Excel extensions, used to disambiguate the shared OLE2 header. */
const OLE2_SPREADSHEET_EXTENSIONS = [".xls", ".xlt", ".xlm"];

/**
 * Heuristic detection of delimited plain text (CSV/TSV).
 *
 * There is no signature to check — a CSV is just text — so this is genuinely a
 * guess, and it is scoped to make a *wrong* guess harmless: it only ever runs
 * on bytes that matched none of the real container signatures, so the
 * alternative outcome for anything it sees is already a rejection. Getting it
 * right upgrades a generic refusal to a useful one; getting it wrong swaps one
 * refusal message for another.
 *
 * The test is: the leading bytes are printable text, and the first line
 * contains a delimiter. Deliberately not stricter (counting consistent field
 * counts across lines, say) — a real-world CSV export with a title row, ragged
 * quoting, or a single column would fail a strict check, and this only needs to
 * be right often enough to show better copy.
 *
 * @param {Uint8Array} bytes
 * @returns {boolean}
 */
export function looksLikeCsv(bytes) {
  if (!bytes || bytes.length === 0) return false;

  // Scan a bounded window: a delimiter in the first line is the signal, and
  // reading further only adds ways for binary noise to confuse the check.
  const window = bytes.subarray ? bytes.subarray(0, 1024) : bytes.slice(0, 1024);

  let firstLine = [];
  for (let i = 0; i < window.length; i++) {
    const byte = window[i];

    // A NUL or other C0 control character means this is binary, not text. Tab,
    // newline, and carriage return are the exceptions — all legal in a CSV.
    if (byte === 0x00) return false;
    if (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d) return false;

    if (byte === 0x0a || byte === 0x0d) break;
    firstLine.push(byte);
  }

  if (firstLine.length === 0) return false;

  // Comma, semicolon (the European locale export), or tab. Excel writes all
  // three depending on the machine's list separator.
  return firstLine.some((byte) => byte === 0x2c || byte === 0x3b || byte === 0x09);
}

/**
 * Identifies a spreadsheet container from its leading bytes.
 *
 * Returns a format tag the caller can act on rather than a bare boolean, so
 * "this is a presentation", "this is a CSV", and "this is not a spreadsheet at
 * all" can be given different messages — the same reason describePdfError
 * exists.
 *
 * `filename` is consulted for **OLE2 files only**, and only because the format
 * genuinely cannot be resolved from the header (see the note at the top of this
 * file). Everywhere else the bytes decide and the name is ignored, which is the
 * rule the rest of the codebase follows.
 *
 * @param {Uint8Array} bytes    First bytes of a candidate file (at least ZIP_SCAN_BYTES).
 * @param {string} [filename]   Original name, used only to disambiguate OLE2.
 * @returns {"xlsx"|"xls"|"ods"|"xlsb"|"docx"|"pptx"|"csv"|"ole2"|"zip"|"unknown"}
 */
export function detectSpreadsheetFormat(bytes, filename = "") {
  if (!bytes || typeof bytes.length !== "number" || bytes.length === 0) {
    return "unknown";
  }

  if (startsWith(bytes, OLE2_MAGIC)) {
    // A legacy Office binary. Which application wrote it is not recoverable
    // from the header, so the extension is the only cheap signal. An
    // unrecognised one returns "ole2" and the caller decides — refusing
    // outright would reject a .xls that arrived with no extension, which the
    // converter would have handled fine.
    const name = String(filename || "").toLowerCase();
    if (OLE2_SPREADSHEET_EXTENSIONS.some((extension) => name.endsWith(extension))) {
      return "xls";
    }
    return "ole2";
  }

  if (startsWith(bytes, ZIP_MAGIC)) {
    // Order matters. The .xlsb check runs BEFORE the .xlsx one, because a .xlsb
    // carries the same "xl/" entries and would otherwise be accepted as OOXML
    // and then render as blank pages — the silent failure this whole module
    // exists to prevent.
    if (ZIP_MARKERS.xlsb.some((marker) => containsAscii(bytes, marker))) return "xlsb";
    if (ZIP_MARKERS.xlsx.some((marker) => containsAscii(bytes, marker))) return "xlsx";
    if (ZIP_MARKERS.ods.some((marker) => containsAscii(bytes, marker))) return "ods";
    if (ZIP_MARKERS.docx.some((marker) => containsAscii(bytes, marker))) return "docx";
    if (ZIP_MARKERS.pptx.some((marker) => containsAscii(bytes, marker))) return "pptx";

    // A ZIP we could not identify. Might still be a .xlsx whose entries are
    // ordered so unusually that "xl/" fell outside the scan window, so the
    // caller decides whether to trust it — see validateSpreadsheetFile.
    return "zip";
  }

  // No container signature matched. Before giving up, check for the wrong file
  // people most often bring to this tool.
  if (looksLikeCsv(bytes)) return "csv";

  return "unknown";
}

/** Formats the converter accepts, as returned by detectSpreadsheetFormat. */
const CONVERTIBLE = new Set(["xlsx", "xls", "ods"]);

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
export function checkSpreadsheetMetadata(file) {
  if (!file) {
    return { ok: false, error: "No file was selected." };
  }

  if (file.size === 0) {
    return { ok: false, error: "That file is empty (0 bytes). Try choosing it again." };
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      error: `That spreadsheet is larger than the ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB limit. Conversion runs on a shared server, so very large files would hold it up for everyone. Try deleting sheets you don't need to send, or setting a print area around the range that matters.`,
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
      error: "That's a PDF, not a spreadsheet. This tool converts Excel files into PDFs; it doesn't convert them back.",
    };
  }

  if (name.endsWith(".numbers")) {
    return {
      ok: false,
      error: "Apple Numbers spreadsheets aren't supported. Open it in Numbers and export as Excel (.xlsx) first.",
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
 * @returns {Promise<{ok: true, file: File, format: string, isLarge: boolean} | {ok: false, error: string, reason?: string}>}
 */
export async function validateSpreadsheetFile(file) {
  const meta = checkSpreadsheetMetadata(file);
  if (!meta.ok) return meta;

  let header;
  try {
    const slice = file.slice(0, ZIP_SCAN_BYTES);
    header = new Uint8Array(await slice.arrayBuffer());
  } catch {
    // Happens when a file is moved/deleted between the picker and the read, or
    // on a permission-revoked handle. Worth its own message: retrying genuinely
    // fixes it, unlike a malformed-spreadsheet error.
    return { ok: false, error: "Could not read that file. It may have been moved or deleted." };
  }

  const format = detectSpreadsheetFormat(header, file.name);

  if (CONVERTIBLE.has(format)) {
    return { ok: true, file, format, isLarge: file.size > 5 * 1024 * 1024 };
  }

  // Named formats get named errors. A user who picked the wrong file out of a
  // folder needs to know *which* wrong file it was.
  if (format === "csv") {
    return {
      ok: false,
      reason: "csv",
      error:
        "CSV files aren't supported, because a CSV has no column widths, fonts, or page setup — any PDF made from one would be invented rather than converted. Open it in Excel, save as .xlsx, then convert that.",
    };
  }

  if (format === "xlsb") {
    // Refused rather than forwarded, and this is the reason the .xlsb marker is
    // checked before the .xlsx one. LibreOffice's binary-workbook support is
    // partial: it opens the file and frequently renders blank or truncated
    // sheets, so forwarding it would return a technically-successful PDF with
    // missing data — the worst available outcome, and the same class of silent
    // failure as HEIC and scanned PDFs elsewhere in this codebase.
    return {
      ok: false,
      error:
        "Binary Excel workbooks (.xlsb) aren't supported — they often convert with blank or missing sheets, which is worse than not converting at all. Open it in Excel and save as .xlsx, then convert that.",
    };
  }

  if (format === "docx") {
    return {
      ok: false,
      error: "That's a Word document, not a spreadsheet. Use the Word to PDF tool for that.",
    };
  }
  if (format === "pptx") {
    return {
      ok: false,
      error: "That's a PowerPoint presentation, not a spreadsheet. Use the PowerPoint to PDF tool for that.",
    };
  }

  // A legacy Office binary whose extension didn't identify it. It is as likely
  // to be a .doc or .ppt as a .xls, and forwarding it would spend a container
  // slot to produce a PDF of the wrong kind of file — or a failure the user
  // can't interpret. Naming the ambiguity is more useful than either.
  if (format === "ole2") {
    return {
      ok: false,
      error: "That's an older Microsoft Office file, but its name doesn't say which kind. Rename it with a .xls extension if it's a spreadsheet, then try again.",
    };
  }

  // An unrecognised ZIP. If the extension says .xlsx we let it through rather
  // than refuse: the scan window is a heuristic, and a false rejection blocks a
  // file the converter would have handled, while a false acceptance costs one
  // failed conversion with an accurate error. The converter is the authority on
  // whether it can read the file — this check exists to catch obvious mistakes
  // cheaply, not to be the final word.
  if (format === "zip") {
    const name = (file.name || "").toLowerCase();
    if (name.endsWith(".xlsx") || name.endsWith(".xlsm") || name.endsWith(".ods")) {
      return { ok: true, file, format: "xlsx", isLarge: file.size > 5 * 1024 * 1024 };
    }
    return {
      ok: false,
      error: "That looks like a ZIP archive rather than a spreadsheet. If it contains one, extract it first and choose the .xlsx file.",
    };
  }

  return {
    ok: false,
    error: "That file isn't an Excel spreadsheet. Choose a .xlsx, .xls, .xlsm, or .ods file.",
  };
}

/**
 * Maps a converter failure onto something a user can act on.
 *
 * Mirrors describePresentationError. The generic fallback is the failure mode
 * to avoid: a password-protected workbook and a corrupt one need completely
 * different responses, and "conversion failed" addresses neither.
 *
 * @param {unknown} error   The thrown error.
 * @param {string} fallback Message when the cause isn't recognised.
 * @returns {string}
 */
export function describeSpreadsheetError(
  error,
  fallback = "Something went wrong converting this spreadsheet."
) {
  const message = String(error?.message || error || "").toLowerCase();

  if (message.includes("password") || message.includes("encrypted")) {
    return "This spreadsheet is password-protected. Open it in Excel, remove the password, then try again.";
  }

  if (
    message.includes("corrupt") ||
    message.includes("damaged") ||
    message.includes("parse") ||
    message.includes("invalid")
  ) {
    return "This spreadsheet appears to be damaged and couldn't be read. Try re-saving it from Excel, Google Sheets, or LibreOffice.";
  }

  return fallback;
}
