// Shared file-acceptance rules for the image tools.
//
// The image tools each inlined `file.type.startsWith("image/")`, which has the
// same defect the PDF tools had before pdfFile.js: File.type comes from the OS
// mime registry, not the bytes. Android file providers, files restored from a
// zip, and iPhone HEIC images routinely arrive with an empty type and were
// rejected despite being perfectly valid. The bytes are the reliable signal.
//
// Sniffing also lets us tell the user something genuinely useful that the old
// code could not: whether a browser can actually *decode* the format. HEIC is
// the case that matters — it's what every iPhone shoots by default, no browser
// decodes it via canvas, and the old tools accepted it and then failed with
// "Could not convert this image", which reads as a broken tool rather than an
// unsupported format.

// Signatures are checked against the file head. Offsets matter: RIFF/WebP and
// the ISO base-media formats (HEIC/AVIF) identify themselves a few bytes in.
const SIGNATURES = [
  { mime: "image/jpeg", offset: 0, bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/png", offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: "image/gif", offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] },
  { mime: "image/bmp", offset: 0, bytes: [0x42, 0x4d] },
  // "RIFF....WEBP" — the four size bytes at offset 4 are skipped.
  { mime: "image/webp", offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] },
  // ISO-BMFF brands sit at offset 8, after the box size and "ftyp".
  { mime: "image/avif", offset: 8, bytes: [0x61, 0x76, 0x69, 0x66] },
  { mime: "image/heic", offset: 8, bytes: [0x68, 0x65, 0x69, 0x63] },
  { mime: "image/heic", offset: 8, bytes: [0x68, 0x65, 0x69, 0x78] },
  { mime: "image/heif", offset: 8, bytes: [0x6d, 0x69, 0x66, 0x31] },
];

const HEADER_BYTES = 32;

// Formats no browser can decode through <canvas>. Detected so the tool can
// say why up front instead of failing at the draw step.
const UNDECODABLE = new Set(["image/heic", "image/heif"]);

// Canvas has a hard per-surface pixel ceiling that varies by browser; Safari's
// is the tightest at roughly 16.7M pixels (4096x4096 on iOS). Past it, canvas
// operations don't throw — they silently produce a blank image, which is far
// worse than an error because the user downloads an empty file. Checked
// against the decoded dimensions, not the file size.
export const MAX_CANVAS_PIXELS = 16_777_216;

// Decoding is what actually costs memory, and a modest file can decode huge
// (a 2 MB PNG can be 100 MP). The byte cap is a coarse first gate.
export const MAX_IMAGE_BYTES = 50 * 1024 * 1024; // 50 MB

/**
 * Identifies an image format from its header bytes.
 *
 * @param {Uint8Array} header First bytes of the file.
 * @returns {string|null} A mime type, or null if unrecognised.
 */
export function sniffImageType(header) {
  if (!header || typeof header.length !== "number") return null;

  for (const { mime, offset, bytes } of SIGNATURES) {
    if (header.length < offset + bytes.length) continue;

    let matched = true;
    for (let i = 0; i < bytes.length; i++) {
      if (header[offset + i] !== bytes[i]) {
        matched = false;
        break;
      }
    }
    if (matched) return mime;
  }

  return null;
}

/** True for formats a browser cannot decode via canvas. */
export function isUndecodable(mime) {
  return UNDECODABLE.has(mime);
}

/**
 * Full acceptance check: size, then magic bytes.
 *
 * Reads only the header via Blob.slice, so rejecting a wrong file never pays
 * the cost of loading a large one.
 *
 * @param {File} file
 * @returns {Promise<{ok: true, file: File, type: string} | {ok: false, error: string}>}
 */
export async function validateImageFile(file) {
  if (!file) return { ok: false, error: "No file was selected." };

  if (file.size === 0) {
    return { ok: false, error: "That file is empty (0 bytes). Try choosing it again." };
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      error: `That image is larger than the ${Math.round(MAX_IMAGE_BYTES / (1024 * 1024))} MB limit. Everything here runs on your device, so a file that size would run the tab out of memory.`,
    };
  }

  let header;
  try {
    header = new Uint8Array(await file.slice(0, HEADER_BYTES).arrayBuffer());
  } catch {
    return { ok: false, error: "Could not read that file. It may have been moved or deleted." };
  }

  const type = sniffImageType(header);

  if (!type) {
    return {
      ok: false,
      error: "That file isn't an image we recognise. Supported: JPG, PNG, WebP, AVIF, GIF and BMP.",
    };
  }

  // Named explicitly rather than lumped in with "unrecognised": this is the
  // default iPhone camera format, so a vague error here would be a dead end
  // for a lot of people. Telling them what to do about it is the whole point.
  if (isUndecodable(type)) {
    return {
      ok: false,
      error:
        "HEIC images can't be decoded by browsers, so this tool can't open them. On iPhone, either set Camera → Formats to \"Most Compatible\", or share the photo — iOS converts it to JPG automatically.",
    };
  }

  return { ok: true, file, type };
}

/**
 * Validates a batch, keeping the good files and describing the rejects.
 *
 * @param {File[]|FileList} files
 * @returns {Promise<{accepted: {file: File, type: string}[], rejected: {name: string, error: string}[]}>}
 */
export async function validateImageFiles(files) {
  const list = Array.from(files || []);
  const results = await Promise.all(list.map((file) => validateImageFile(file)));

  const accepted = [];
  const rejected = [];

  results.forEach((result, index) => {
    if (result.ok) accepted.push({ file: list[index], type: result.type });
    else rejected.push({ name: list[index]?.name || "Unnamed file", error: result.error });
  });

  return { accepted, rejected };
}

/**
 * Turns a batch's rejects into one sentence for the UI.
 *
 * @param {{name: string, error: string}[]} rejected
 */
export function describeImageRejections(rejected) {
  if (!rejected || rejected.length === 0) return "";
  if (rejected.length === 1) return `Skipped "${rejected[0].name}": ${rejected[0].error}`;

  const names = rejected.map((r) => `"${r.name}"`).join(", ");
  return `Skipped ${rejected.length} files: ${names}`;
}

/**
 * Checks decoded dimensions against the canvas pixel ceiling.
 *
 * @returns {{ok: true} | {ok: false, error: string}}
 */
export function checkPixelBudget(width, height) {
  const pixels = width * height;
  if (pixels > MAX_CANVAS_PIXELS) {
    return {
      ok: false,
      error: `This image is ${width}×${height} (${Math.round(pixels / 1e6)} megapixels), which is past what browsers can process on a canvas. Try resizing it down first.`,
    };
  }
  return { ok: true };
}

/**
 * Maps a decode/encode failure onto something a user can act on.
 *
 * @param {unknown} error
 * @param {string} fallback
 */
export function describeImageError(error, fallback = "Something went wrong processing this image.") {
  const message = String(error?.message || error || "").toLowerCase();

  if (message.includes("out of memory") || message.includes("allocation")) {
    return "This image is too large for your device's memory. Try resizing it down first.";
  }

  if (message.includes("decode") || message.includes("source image")) {
    return "This image couldn't be decoded. It may be damaged, or saved in a format this browser doesn't support.";
  }

  if (message.includes("encode")) {
    return "This image couldn't be saved in that format. Try JPG or PNG instead.";
  }

  return fallback;
}
