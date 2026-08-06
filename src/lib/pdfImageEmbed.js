// Which images pdf-lib can embed, and what to do about the ones it can't.
//
// pdf-lib exposes exactly two embedders: embedJpg() and embedPng(). That isn't
// a library limitation so much as a PDF one — the format's image XObjects carry
// DCTDecode (JPEG) and Flate (PNG-ish) streams, and there is no WebP or AVIF
// filter in the spec. So anything else has to be re-encoded before it can go in
// a document.
//
// The site already owns a decode-and-re-encode pipeline (the image worker), so
// the transcode is nearly free to add. What matters is choosing the *right*
// target format, because getting it wrong either bloats the file enormously or
// silently destroys transparency. See transcodeTargetFor().

/** Formats pdf-lib can embed directly, no transcode needed. */
const NATIVE = new Set(["image/jpeg", "image/png"]);

/**
 * True when pdf-lib can embed this type as-is.
 *
 * @param {string} mimeType A sniffed type from imageValidation.js.
 */
export function isNativelyEmbeddable(mimeType) {
  return NATIVE.has(mimeType);
}

/**
 * Chooses what to re-encode a non-embeddable image into.
 *
 * The decision is about transparency, and getting it backwards is the kind of
 * bug that only shows up on someone else's file:
 *
 *   - **WebP, AVIF, GIF** can all carry an alpha channel. Re-encoding them to
 *     JPG would flatten transparency onto a matte — usually white, which looks
 *     fine on a white page and catastrophic on any other background, and is
 *     unrecoverable once done. They go to PNG.
 *   - **BMP** is uncompressed and effectively never carries usable alpha in
 *     the wild. PNG would work, but a large BMP re-encoded losslessly produces
 *     an enormous PDF for a photo that had no alpha to protect. JPG is the
 *     honest choice, and matches what the source could represent anyway.
 *
 * PNG is the safe default for anything unrecognised: paying bytes is
 * recoverable, discarding an alpha channel is not.
 *
 * @param {string} mimeType
 * @returns {"image/png"|"image/jpeg"}
 */
export function transcodeTargetFor(mimeType) {
  if (mimeType === "image/bmp") return "image/jpeg";
  return "image/png";
}

/**
 * Plans the embed step for one source image.
 *
 * Returned as a description rather than performed here so the planning stays
 * testable in node — the actual encode needs OffscreenCanvas, which vitest's
 * node environment doesn't have.
 *
 * @param {string} mimeType
 * @returns {{embedAs: "jpg"|"png", transcodeTo: string|null}}
 */
export function planEmbed(mimeType) {
  if (mimeType === "image/jpeg") return { embedAs: "jpg", transcodeTo: null };
  if (mimeType === "image/png") return { embedAs: "png", transcodeTo: null };

  const target = transcodeTargetFor(mimeType);
  return {
    embedAs: target === "image/jpeg" ? "jpg" : "png",
    transcodeTo: target,
  };
}

/**
 * Explains a transcode to the user.
 *
 * Shown because it's a real, if minor, surprise: someone converting AVIF photos
 * should know the PDF doesn't contain their AVIF bytes, particularly if they
 * chose AVIF for the file size and are about to wonder why the PDF is large.
 *
 * @param {{name: string, type: string}[]} transcoded
 * @returns {string} Empty when nothing was transcoded.
 */
export function describeTranscodes(transcoded) {
  if (!transcoded || transcoded.length === 0) return "";

  // Deduplicated and named by format rather than by file: a batch of thirty
  // WebPs should say "WebP", not list thirty filenames.
  const formats = [...new Set(transcoded.map((item) => shortFormatName(item.type)))];
  const list =
    formats.length === 1
      ? formats[0]
      : `${formats.slice(0, -1).join(", ")} and ${formats[formats.length - 1]}`;

  const count = transcoded.length;
  return `PDF can only store JPG and PNG images, so ${count === 1 ? "one" : count} ${list} image${count === 1 ? " was" : "s were"} re-encoded on the way in. Quality is preserved; file size may differ.`;
}

function shortFormatName(mimeType) {
  switch (mimeType) {
    case "image/webp":
      return "WebP";
    case "image/avif":
      return "AVIF";
    case "image/gif":
      return "GIF";
    case "image/bmp":
      return "BMP";
    case "image/png":
      return "PNG";
    default:
      return "JPG";
  }
}

/**
 * Names the output file for a set of images.
 *
 * A single image keeps its own stem ("receipt.jpg" -> "receipt.pdf"), which is
 * far more useful than a generic name when someone converts one file at a time
 * and ends up with a downloads folder of "converted.pdf (3)".
 *
 * @param {{name: string}[]} files
 * @returns {string}
 */
export function outputPdfName(files) {
  if (!files || files.length === 0) return "images.pdf";

  if (files.length === 1) {
    const stem = String(files[0].name || "image").replace(/\.[^./\\]+$/, "");
    return `${stem || "image"}.pdf`;
  }

  return "images.pdf";
}
