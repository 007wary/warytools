// Reads pixel dimensions from an image file's header bytes.
//
// Exists because a cover's REAL size has to be declared in og:image:width /
// og:image:height. Assuming the recommended 1200x630 and emitting that for
// every file is wrong the moment a cover is any other size — crawlers that
// trust those tags without fetching the image lay the preview out to the
// declared box, so the card renders letterboxed or cropped with nothing in
// the page's own HTML looking incorrect. That shipped here: a 1424x752 cover
// was declared as 1200x630.
//
// Header-only, no decoding and no dependency: dimensions live in the first
// few dozen bytes of every format below, so this reads a small prefix rather
// than the whole file. `sharp` would do it too, but it is not a dependency of
// this project (only an override), and pulling an image library in to read
// four integers at build time is not a trade worth making.
//
// Pure: takes a Buffer/Uint8Array, returns {width, height} or null. The
// caller does the filesystem work.

function readUInt32BE(bytes, offset) {
  return (
    ((bytes[offset] << 24) >>> 0) +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3]
  );
}

function readUInt16BE(bytes, offset) {
  return (bytes[offset] << 8) + bytes[offset + 1];
}

function readUInt16LE(bytes, offset) {
  return bytes[offset] + (bytes[offset + 1] << 8);
}

function readUInt24LE(bytes, offset) {
  return bytes[offset] + (bytes[offset + 1] << 8) + (bytes[offset + 2] << 16);
}

function startsWith(bytes, signature, offset = 0) {
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

// PNG: IHDR is always the first chunk, at a fixed offset.
function pngSize(bytes) {
  if (!startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return null;
  if (bytes.length < 24) return null;
  return { width: readUInt32BE(bytes, 16), height: readUInt32BE(bytes, 20) };
}

// JPEG: dimensions live in a SOF marker, whose position varies — EXIF blocks,
// ICC profiles and embedded thumbnails all sit before it. So the marker chain
// has to be walked rather than indexed into.
function jpegSize(bytes) {
  if (!startsWith(bytes, [0xff, 0xd8])) return null;

  let offset = 2;

  // `<=` because a SOF segment's last needed byte is at offset+8 (the low
  // byte of the width), so a file ending exactly there is still readable. The
  // strict `<` this replaces required a tenth byte that a minimal JPEG — one
  // whose SOF is its final segment — does not have, so those returned null
  // while padded files parsed fine.
  while (offset + 9 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null; // desynchronised — refuse to guess

    const marker = bytes[offset + 1];

    // Standalone markers carry no length field.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }

    // SOF0-SOF15 carry the frame dimensions. DHT (0xC4), JPG (0xC8) and DAC
    // (0xCC) sit inside that numeric range but are NOT frame headers, hence
    // the explicit exclusions — reading them as SOF yields plausible-looking
    // nonsense rather than an error.
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

    if (isSof) {
      return { height: readUInt16BE(bytes, offset + 5), width: readUInt16BE(bytes, offset + 7) };
    }

    const length = readUInt16BE(bytes, offset + 2);

    // A length below 2 would leave the offset unchanged and spin forever —
    // the same infinite-loop guard the metadata walkers in imageMetadata.js
    // carry, and for the same reason: this parses untrusted files.
    if (length < 2) return null;

    offset += 2 + length;
  }

  return null;
}

// WebP has three sub-formats and they store dimensions completely differently.
// Only VP8X (extended) is common for modern encoder output, but lossy VP8 and
// lossless VP8L are both routinely produced by export tools, so all three are
// handled — a cover silently reporting null would fall back to no declared
// size at all.
function webpSize(bytes) {
  if (!startsWith(bytes, [0x52, 0x49, 0x46, 0x46])) return null; // "RIFF"
  if (!startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return null; // "WEBP"
  if (bytes.length < 30) return null;

  const format = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);

  if (format === "VP8X") {
    // Canvas size is stored minus one, as two 24-bit little-endian values.
    return { width: readUInt24LE(bytes, 24) + 1, height: readUInt24LE(bytes, 27) + 1 };
  }

  if (format === "VP8 ") {
    // Lossy. The 14-bit dimensions follow the 3-byte start code.
    return {
      width: readUInt16LE(bytes, 26) & 0x3fff,
      height: readUInt16LE(bytes, 28) & 0x3fff,
    };
  }

  if (format === "VP8L") {
    // Lossless. 14 bits each, packed across a 32-bit little-endian field,
    // both stored minus one.
    const packed =
      bytes[21] + (bytes[22] << 8) + (bytes[23] << 16) + bytes[24] * 0x1000000;
    return {
      width: (packed & 0x3fff) + 1,
      height: ((packed >> 14) & 0x3fff) + 1,
    };
  }

  return null;
}

/**
 * @param {Uint8Array} bytes  The file's leading bytes (a few KB is plenty).
 * @returns {{width: number, height: number}|null}
 */
export function imageSize(bytes) {
  // 11 is the shortest readable header of any supported format: a JPEG whose
  // SOF is its first and only segment (SOI + a 9-byte frame header). Each
  // reader below does its own, stricter length check, so this only guards
  // against indexing into an obviously-empty buffer. A larger floor here
  // silently rejected valid minimal JPEGs before their reader ever ran.
  if (!bytes || bytes.length < 11) return null;

  for (const reader of [pngSize, jpegSize, webpSize]) {
    const size = reader(bytes);
    // Reject non-positive dimensions rather than passing them on: a zero
    // would be emitted as og:image:width="0", which is worse than omitting
    // the tag.
    if (size && size.width > 0 && size.height > 0) return size;
  }

  return null;
}
