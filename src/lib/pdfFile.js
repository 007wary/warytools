// Shared file-acceptance rules for every PDF tool.
//
// Previously each tool inlined `file.type === "application/pdf"` and rejected
// anything else. That check is wrong in both directions:
//
//   - `File.type` comes from the OS mime registry, not the bytes. Windows
//     installs without a PDF handler, most Android file providers, and files
//     arriving through a drag-and-drop from an archive tool all hand over an
//     empty string. Those are valid PDFs the old check refused to open.
//   - Conversely a renamed .zip carries no PDF bytes but can be reported as
//     application/pdf by a mis-registered handler, so the tool accepted it and
//     then failed deep inside pdf-lib with an unhelpful parse error.
//
// The reliable signal is the file header. A PDF must begin with "%PDF-" per
// ISO 32000-1 §7.5.2. We treat the mime type and extension as hints only, and
// the magic bytes as the decision — which is what every desktop PDF reader
// does. Sniffing happens in the browser on bytes the user already has; nothing
// is uploaded.

/** PDF files must start with these five bytes: "%PDF-" */
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d];

// Read enough of the head to find "%PDF-" even when a file carries leading
// junk. Acrobat itself tolerates the header appearing within the first 1024
// bytes, and real-world files produced by broken generators rely on that.
const HEADER_SCAN_BYTES = 1024;

// Above this, a browser tab doing `arrayBuffer()` + pdf-lib parse + save is
// holding several copies of the document at once and will OOM on most
// devices before it finishes. Refusing up front with a clear message beats a
// silent tab crash that loses the user's work.
export const MAX_PDF_BYTES = 100 * 1024 * 1024; // 100 MB

// Files past this are allowed but warned about — they work, they're just slow
// enough that a user with no feedback assumes the tool has hung.
export const LARGE_PDF_BYTES = 25 * 1024 * 1024; // 25 MB

/**
 * Scans a header slice for the "%PDF-" signature.
 *
 * @param {Uint8Array} bytes First bytes of a candidate file.
 * @returns {boolean} True if the PDF signature appears within the slice.
 */
export function hasPdfSignature(bytes) {
  if (!bytes || typeof bytes.length !== "number") return false;

  const limit = Math.min(bytes.length, HEADER_SCAN_BYTES) - PDF_MAGIC.length;
  for (let start = 0; start <= limit; start++) {
    let matched = true;
    for (let i = 0; i < PDF_MAGIC.length; i++) {
      if (bytes[start + i] !== PDF_MAGIC[i]) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }
  return false;
}

/**
 * Cheap pre-check on metadata alone, before any bytes are read.
 *
 * Deliberately permissive: an unknown/blank mime type passes, because a blank
 * type is the normal case on several platforms. Only a positively-wrong type
 * (image/png, application/zip) is rejected here. The byte check is what
 * actually decides.
 *
 * @param {File} file
 * @returns {{ok: true} | {ok: false, error: string}}
 */
export function checkPdfMetadata(file) {
  if (!file) {
    return { ok: false, error: "No file was selected." };
  }

  if (file.size === 0) {
    return { ok: false, error: "That file is empty (0 bytes). Try choosing it again." };
  }

  if (file.size > MAX_PDF_BYTES) {
    return {
      ok: false,
      error: `That PDF is larger than the ${formatLimit(MAX_PDF_BYTES)} limit for in-browser processing. Everything here runs on your device, so very large files would run the tab out of memory.`,
    };
  }

  // A type that is present, not a PDF, and not the generic binary fallback is
  // a confident reject — no point reading bytes off a PNG.
  const type = (file.type || "").toLowerCase();
  const definitelyNotPdf =
    type !== "" && type !== "application/pdf" && type !== "application/octet-stream";

  if (definitelyNotPdf) {
    return { ok: false, error: "That doesn't look like a PDF. Please choose a .pdf file." };
  }

  return { ok: true };
}

/**
 * Full acceptance check: metadata, then magic bytes.
 *
 * Reads only the first {@link HEADER_SCAN_BYTES} bytes via `Blob.slice`, so
 * rejecting a wrong file never pays the cost of loading a large one.
 *
 * @param {File} file
 * @returns {Promise<{ok: true, file: File, isLarge: boolean} | {ok: false, error: string}>}
 */
export async function validatePdfFile(file) {
  const meta = checkPdfMetadata(file);
  if (!meta.ok) return meta;

  let header;
  try {
    const slice = file.slice(0, HEADER_SCAN_BYTES);
    header = new Uint8Array(await slice.arrayBuffer());
  } catch {
    // Happens when a file is moved/deleted between the picker and the read,
    // or on a permission-revoked handle. Worth its own message: retrying
    // genuinely fixes it, unlike a malformed-PDF error.
    return { ok: false, error: "Could not read that file. It may have been moved or deleted." };
  }

  if (!hasPdfSignature(header)) {
    return {
      ok: false,
      error: "That file isn't a valid PDF. It may be renamed, corrupted, or a different format.",
    };
  }

  return { ok: true, file, isLarge: file.size > LARGE_PDF_BYTES };
}

/**
 * Validates a batch, keeping the good files and describing the rejects.
 *
 * Merge takes many files at once, and dropping the whole batch because one
 * item was bad is hostile — the user has to work out which one and start
 * over. This keeps everything valid and names what it skipped.
 *
 * @param {File[]|FileList} files
 * @returns {Promise<{accepted: File[], rejected: {name: string, error: string}[]}>}
 */
export async function validatePdfFiles(files) {
  const list = Array.from(files || []);
  const results = await Promise.all(list.map((file) => validatePdfFile(file)));

  const accepted = [];
  const rejected = [];

  results.forEach((result, index) => {
    if (result.ok) accepted.push(list[index]);
    else rejected.push({ name: list[index]?.name || "Unnamed file", error: result.error });
  });

  return { accepted, rejected };
}

/**
 * Turns a batch's rejects into one sentence for the UI.
 *
 * @param {{name: string, error: string}[]} rejected
 * @returns {string} Empty string when nothing was rejected.
 */
export function describeRejections(rejected) {
  if (!rejected || rejected.length === 0) return "";
  if (rejected.length === 1) return `Skipped "${rejected[0].name}": ${rejected[0].error}`;

  const names = rejected.map((r) => `"${r.name}"`).join(", ");
  return `Skipped ${rejected.length} files that aren't valid PDFs: ${names}`;
}

/**
 * Maps a low-level pdf-lib/pdf.js failure onto something a user can act on.
 *
 * The tools used to render every failure as "Make sure it's valid and
 * unencrypted", which is unhelpful precisely when it matters: a
 * password-protected file and an out-of-memory crash need completely
 * different responses from the user, and neither is addressed by that string.
 *
 * @param {unknown} error   The thrown error.
 * @param {string} fallback Message when the cause isn't recognised.
 * @returns {string}
 */
export function describePdfError(error, fallback = "Something went wrong processing this PDF.") {
  const message = String(error?.message || error || "").toLowerCase();

  if (message.includes("password") || message.includes("encrypted")) {
    return "This PDF is password-protected. Open it in a PDF reader, remove the password, then try again.";
  }

  if (message.includes("out of memory") || message.includes("allocation")) {
    return "This PDF is too large for your device's memory. Try splitting it into smaller files first.";
  }

  if (
    message.includes("invalid pdf") ||
    message.includes("no pdf header") ||
    message.includes("parse") ||
    message.includes("corrupt") ||
    message.includes("xref")
  ) {
    return "This PDF appears to be damaged and couldn't be read. Try re-exporting it from the app that created it.";
  }

  return fallback;
}

function formatLimit(bytes) {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}
