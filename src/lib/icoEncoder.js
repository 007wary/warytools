// Builds a Windows .ico container around already-encoded PNG images.
//
// This module exists because canvas cannot encode ICO. `toBlob("image/x-icon")`
// does not throw — it silently returns a PNG, which is the same class of
// failure as the unprobed AVIF option in imageFormats.js: the user downloads
// "favicon.ico" containing PNG bytes. Some browsers happen to render that, so
// it appears to work right up until it doesn't, which is worse than an error.
//
// The format is genuinely simple, which is why writing it by hand beats adding
// a dependency for it. An .ico is a 6-byte directory header, then one 16-byte
// entry per image, then the image payloads concatenated:
//
//   ICONDIR       6 bytes    reserved(0), type(1 = icon), image count
//   ICONDIRENTRY  16 bytes   width, height, palette, reserved, planes,
//                            bitDepth, byteLength, byteOffset   [x count]
//   payloads      ...        each image's bytes, in entry order
//
// Everything is little-endian. The payloads here are PNGs rather than the
// legacy BMP+AND-mask form: PNG-in-ICO has been supported since Windows Vista,
// carries real alpha rather than a 1-bit mask, and is what every current
// generator emits. Writing BMP would mean hand-rolling a bottom-up DIB with a
// padded mask for a compatibility target (Windows XP) that no longer matters.

/** Byte lengths fixed by the ICO specification. */
const ICONDIR_BYTES = 6;
const ICONDIRENTRY_BYTES = 16;

// An ICO dimension field is a single byte, and 0 means 256 — the format's own
// escape hatch for its largest legal size. Anything above 256 cannot be
// expressed at all, so it's rejected rather than silently wrapped to a small
// number by the byte write.
export const MAX_ICO_SIZE = 256;

/**
 * Encodes a `.ico` from a set of PNG-encoded images.
 *
 * @param {{width: number, height: number, bytes: ArrayBuffer|Uint8Array}[]} images
 *   One entry per size, each holding PNG bytes. Order is preserved; callers
 *   are expected to sort smallest-first, which is the convention every other
 *   generator follows and what Windows' own icon editor writes.
 * @returns {Uint8Array} The complete .ico file.
 */
export function encodeIco(images) {
  if (!Array.isArray(images) || images.length === 0) {
    throw new Error("An .ico needs at least one image.");
  }

  // The count field is 16-bit, though no real icon comes close to the ceiling.
  if (images.length > 0xffff) {
    throw new Error("An .ico cannot hold more than 65535 images.");
  }

  const entries = images.map((image, index) => {
    const bytes = toBytes(image?.bytes);

    if (!bytes || bytes.length === 0) {
      throw new Error(`Image ${index + 1} has no data.`);
    }

    const width = Number(image?.width);
    const height = Number(image?.height);

    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
      throw new Error(`Image ${index + 1} has an invalid size.`);
    }

    if (width > MAX_ICO_SIZE || height > MAX_ICO_SIZE) {
      throw new Error(
        `An .ico cannot hold an image larger than ${MAX_ICO_SIZE}×${MAX_ICO_SIZE} (got ${width}×${height}).`
      );
    }

    return { width, height, bytes };
  });

  const headerBytes = ICONDIR_BYTES + entries.length * ICONDIRENTRY_BYTES;
  const payloadBytes = entries.reduce((sum, entry) => sum + entry.bytes.length, 0);

  const output = new Uint8Array(headerBytes + payloadBytes);
  const view = new DataView(output.buffer);

  // ICONDIR.
  view.setUint16(0, 0, true); // reserved, must be zero
  view.setUint16(2, 1, true); // 1 = icon (2 would be a cursor)
  view.setUint16(4, entries.length, true);

  // Payloads follow every directory entry, so the first offset is past them all.
  let payloadOffset = headerBytes;

  entries.forEach((entry, index) => {
    const at = ICONDIR_BYTES + index * ICONDIRENTRY_BYTES;

    // 256 is written as 0 — see MAX_ICO_SIZE. Using the raw value here would
    // write 0x100 into a byte field and truncate to 0 anyway, but by accident
    // rather than by the spec's rule, so it's done explicitly.
    view.setUint8(at + 0, entry.width === MAX_ICO_SIZE ? 0 : entry.width);
    view.setUint8(at + 1, entry.height === MAX_ICO_SIZE ? 0 : entry.height);

    view.setUint8(at + 2, 0); // palette size; 0 for non-paletted images
    view.setUint8(at + 3, 0); // reserved, must be zero

    // Colour planes and bit depth. For PNG payloads these are advisory — the
    // PNG's own header is authoritative — but some older readers sort or pick
    // an entry by bit depth, so they're filled in truthfully rather than left
    // at zero: 1 plane, 32 bits per pixel (RGBA), which is what canvas emits.
    view.setUint16(at + 4, 1, true);
    view.setUint16(at + 6, 32, true);

    view.setUint32(at + 8, entry.bytes.length, true);
    view.setUint32(at + 12, payloadOffset, true);

    output.set(entry.bytes, payloadOffset);
    payloadOffset += entry.bytes.length;
  });

  return output;
}

/** Normalises ArrayBuffer / TypedArray input to a Uint8Array view. */
function toBytes(input) {
  if (!input) return null;
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  return null;
}

/**
 * Reads back an .ico's directory.
 *
 * Exists for the tests: verifying the encoder by recomputing its own byte
 * offsets would prove nothing (the lesson from the page-numbers 90°/270°
 * mapping — see CLAUDE.md). Parsing the file back and checking that each
 * declared offset really lands on a PNG signature is a round trip through an
 * independent reader, which is the check that can actually fail.
 *
 * @param {ArrayBuffer|Uint8Array} input
 * @returns {{count: number, entries: {width: number, height: number, length: number, offset: number}[]}}
 */
export function readIcoDirectory(input) {
  const bytes = toBytes(input);
  if (!bytes || bytes.length < ICONDIR_BYTES) {
    throw new Error("Not an .ico: too short to hold a directory header.");
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (view.getUint16(0, true) !== 0 || view.getUint16(2, true) !== 1) {
    throw new Error("Not an .ico: bad directory header.");
  }

  const count = view.getUint16(4, true);
  if (bytes.length < ICONDIR_BYTES + count * ICONDIRENTRY_BYTES) {
    throw new Error("Not an .ico: directory runs past the end of the file.");
  }

  const entries = [];
  for (let index = 0; index < count; index++) {
    const at = ICONDIR_BYTES + index * ICONDIRENTRY_BYTES;
    const rawWidth = view.getUint8(at + 0);
    const rawHeight = view.getUint8(at + 1);

    entries.push({
      // The spec's 0-means-256 rule, undone.
      width: rawWidth === 0 ? MAX_ICO_SIZE : rawWidth,
      height: rawHeight === 0 ? MAX_ICO_SIZE : rawHeight,
      length: view.getUint32(at + 8, true),
      offset: view.getUint32(at + 12, true),
    });
  }

  return { count, entries };
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * True if the bytes at `offset` begin a PNG.
 *
 * Used by the tests to confirm a directory entry's offset points at real image
 * data rather than into the middle of a neighbouring payload — an off-by-one
 * in the offset arithmetic produces a file that is structurally valid and
 * renders as garbage, which nothing else here would catch.
 */
export function looksLikePngAt(input, offset) {
  const bytes = toBytes(input);
  if (!bytes || offset + PNG_SIGNATURE.length > bytes.length) return false;

  return PNG_SIGNATURE.every((byte, index) => bytes[offset + index] === byte);
}
