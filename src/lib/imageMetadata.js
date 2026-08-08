// Reading and removing image metadata by editing the file container directly.
//
// WHY THIS DOESN'T GO THROUGH CANVAS
//
// Every other image tool here decodes to a bitmap and re-encodes, which as a
// side effect discards all metadata — so Compress, Resize and Convert already
// strip EXIF today. It would have been a couple of lines to make this tool a
// third wrapper around the same worker.
//
// That would have been wrong for one reason that matters: re-encoding a JPEG
// recompresses it. For a tool whose entire job is deleting bytes that are not
// pixels, quietly degrading the pixels is indefensible — the user asked to
// remove their GPS coordinates, not to lose a generation of image quality. And
// the loss is invisible at the moment it happens, which is the failure mode
// this codebase keeps designing against (HEIC, scanned PDFs, blank canvases).
//
// So this operates on the container: walk the JPEG marker segments or the PNG
// chunk stream, drop the ones carrying metadata, and copy every remaining byte
// through untouched. The compressed image data is never decoded. The output is
// byte-identical in its pixels, it is strictly smaller, and it is much faster
// than a decode/encode round trip.
//
// The parsing is deliberately defensive. This reads untrusted files, and a
// malformed length field must yield "we can't read this" rather than a crash
// or an infinite loop — every walker below is bounded by the buffer length and
// every segment length is validated before it is trusted.

/**
 * Metadata containers we remove, and what to call them for a human.
 *
 * The user-facing label is part of the data rather than a switch in the UI
 * because the whole point of this tool is telling someone what is in their
 * file. "APP1" means nothing; "Camera and GPS data (EXIF)" is the thing that
 * makes someone realise their photos carry their home address.
 */
export const METADATA_KINDS = {
  exif: "Camera, date, and GPS data (EXIF)",
  xmp: "Editing history and captions (XMP)",
  iptc: "Captions, credits, and keywords (IPTC)",
  icc: "Colour profile (ICC)",
  comment: "Embedded comments",
  thumbnail: "Embedded preview thumbnail",
  other: "Other application data",
};

// JPEG markers. All are preceded by 0xFF.
const SOI = 0xd8; // start of image
const EOI = 0xd9; // end of image
const SOS = 0xda; // start of scan — compressed data follows, stop parsing
const APP0 = 0xe0;
const APP15 = 0xef;
const COM = 0xfe; // comment

// Standalone markers carry no length field: RSTn plus SOI/EOI/TEM.
function isStandaloneMarker(marker) {
  return (marker >= 0xd0 && marker <= 0xd9) || marker === 0x01;
}

/**
 * Classifies a JPEG APPn segment by the identifier string it opens with.
 *
 * The marker number alone is not enough: APP1 is EXIF *or* XMP depending on
 * the payload, and treating them as one lumps two very different disclosures
 * ("where this photo was taken" vs "which software edited it") under one
 * label. APP0/JFIF is deliberately NOT classified as metadata — it is a
 * structural header describing pixel density, and some decoders are unhappy
 * without it. It carries no personal information, so removing it would be
 * risk without benefit.
 */
function classifyAppSegment(bytes, start, length) {
  // Read the identifier, which is an ASCII string terminated by NUL.
  const limit = Math.min(start + Math.min(length, 32), bytes.length);
  let id = "";
  for (let i = start; i < limit; i++) {
    const byte = bytes[i];
    if (byte === 0x00) break;
    id += String.fromCharCode(byte);
  }

  if (id.startsWith("Exif")) return "exif";
  if (id.startsWith("http://ns.adobe.com/xap")) return "xmp";
  if (id.startsWith("http://ns.adobe.com/xmp")) return "xmp";
  // Photoshop IRB — carries IPTC, and also the editor's own saved thumbnail.
  if (id.startsWith("Photoshop")) return "iptc";
  if (id.startsWith("ICC_PROFILE")) return "icc";
  if (id.startsWith("JFIF") || id.startsWith("JFXX")) return null; // structural
  return "other";
}

/**
 * PNG chunk types that carry metadata rather than image data.
 *
 * tEXt/zTXt/iTXt are free-text (often the authoring software, sometimes a
 * description); eXIf is a full EXIF block, which phones and editors do write
 * into PNGs; tIME is a modification timestamp. iCCP is a colour profile.
 *
 * Note what is absent: IHDR, PLTE, IDAT, IEND and the transparency/gamma
 * chunks are all rendering-relevant and must survive, or the image changes
 * appearance. This is an allowlist inverted — anything not named here is
 * copied through.
 */
const PNG_METADATA_CHUNKS = {
  tEXt: "comment",
  zTXt: "comment",
  iTXt: "xmp", // iTXt is the standard carrier for XMP packets in PNG
  eXIf: "exif",
  tIME: "other",
  iCCP: "icc",
};

/** Reads a big-endian uint32. */
function readUint32(bytes, offset) {
  return (
    ((bytes[offset] << 24) >>> 0) +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3]
  );
}

/** Reads a big-endian uint16. */
function readUint16(bytes, offset) {
  return (bytes[offset] << 8) + bytes[offset + 1];
}

/**
 * Walks a JPEG's marker segments and reports which carry metadata.
 *
 * Returns the segments as {kind, start, end} ranges so the same walk can drive
 * both the report and the strip — two walks would be two chances to disagree
 * about what is about to be removed, and a preview that differs from the
 * result is the worst kind of preview.
 *
 * @param {Uint8Array} bytes
 * @returns {{ok: true, segments: Array<{kind: string, start: number, end: number, size: number}>} | {ok: false, error: string}}
 */
export function findJpegMetadata(bytes) {
  if (!bytes || bytes.length < 4) {
    return { ok: false, error: "That file is too small to be a JPEG." };
  }
  if (bytes[0] !== 0xff || bytes[1] !== SOI) {
    return { ok: false, error: "That file isn't a JPEG." };
  }

  const segments = [];
  let offset = 2;

  while (offset < bytes.length) {
    // Markers are 0xFF followed by a non-zero, non-0xFF byte. Fill bytes of
    // 0xFF are legal between segments, so skip them rather than failing.
    if (bytes[offset] !== 0xff) {
      return { ok: false, error: "This JPEG's structure is damaged and can't be edited safely." };
    }
    let markerOffset = offset;
    while (markerOffset < bytes.length && bytes[markerOffset] === 0xff) markerOffset++;
    if (markerOffset >= bytes.length) break;

    const marker = bytes[markerOffset];

    // Compressed scan data begins here and runs to the end of the file. It
    // contains raw 0xFF bytes that are not markers, so continuing to parse
    // past this point would be reading noise as structure.
    if (marker === SOS || marker === EOI) break;

    if (isStandaloneMarker(marker)) {
      offset = markerOffset + 1;
      continue;
    }

    const lengthOffset = markerOffset + 1;
    if (lengthOffset + 2 > bytes.length) {
      return { ok: false, error: "This JPEG ends unexpectedly and can't be edited safely." };
    }

    // The length field includes its own two bytes, so anything under 2 is
    // malformed and would make the walk loop forever.
    const length = readUint16(bytes, lengthOffset);
    if (length < 2) {
      return { ok: false, error: "This JPEG's structure is damaged and can't be edited safely." };
    }

    const segmentEnd = lengthOffset + length;
    if (segmentEnd > bytes.length) {
      return { ok: false, error: "This JPEG ends unexpectedly and can't be edited safely." };
    }

    // The segment range spans the 0xFF, the marker, and the payload — that is
    // exactly what has to be excised to remove it cleanly.
    const start = markerOffset - 1;

    if (marker >= APP0 && marker <= APP15) {
      const kind = classifyAppSegment(bytes, lengthOffset + 2, length - 2);
      if (kind) {
        segments.push({ kind, start, end: segmentEnd, size: segmentEnd - start });
      }
    } else if (marker === COM) {
      segments.push({ kind: "comment", start, end: segmentEnd, size: segmentEnd - start });
    }

    offset = segmentEnd;
  }

  return { ok: true, segments };
}

/**
 * Walks a PNG's chunk stream and reports which chunks carry metadata.
 *
 * @param {Uint8Array} bytes
 * @returns {{ok: true, segments: Array<{kind: string, start: number, end: number, size: number}>} | {ok: false, error: string}}
 */
export function findPngMetadata(bytes) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!bytes || bytes.length < 8) {
    return { ok: false, error: "That file is too small to be a PNG." };
  }
  for (let i = 0; i < signature.length; i++) {
    if (bytes[i] !== signature[i]) return { ok: false, error: "That file isn't a PNG." };
  }

  const segments = [];
  let offset = 8;

  while (offset + 8 <= bytes.length) {
    const length = readUint32(bytes, offset);

    // A chunk is: 4 length + 4 type + data + 4 CRC. A length that overruns the
    // buffer means the file is truncated or lying, and either way the safe
    // answer is to refuse rather than to read past the end.
    const chunkEnd = offset + 12 + length;
    if (length > bytes.length || chunkEnd > bytes.length) {
      return { ok: false, error: "This PNG ends unexpectedly and can't be edited safely." };
    }

    const type =
      String.fromCharCode(bytes[offset + 4]) +
      String.fromCharCode(bytes[offset + 5]) +
      String.fromCharCode(bytes[offset + 6]) +
      String.fromCharCode(bytes[offset + 7]);

    if (PNG_METADATA_CHUNKS[type]) {
      segments.push({
        kind: PNG_METADATA_CHUNKS[type],
        start: offset,
        end: chunkEnd,
        size: chunkEnd - offset,
      });
    }

    if (type === "IEND") break;
    offset = chunkEnd;
  }

  return { ok: true, segments };
}

/**
 * Finds metadata in a supported image, dispatching on sniffed type.
 *
 * @param {Uint8Array} bytes
 * @param {string} mime From sniffImageType in imageValidation.js.
 */
export function findMetadata(bytes, mime) {
  if (mime === "image/jpeg") return findJpegMetadata(bytes);
  if (mime === "image/png") return findPngMetadata(bytes);
  return {
    ok: false,
    error:
      "Metadata can only be removed from JPG and PNG files without re-compressing them. For other formats, use Convert Image — it strips metadata as a side effect.",
  };
}

/**
 * Removes the given byte ranges, copying everything else through untouched.
 *
 * Ranges are sorted and merged before removal: an unsorted or overlapping list
 * would splice the wrong bytes out and produce a corrupt file that still opens
 * in some viewers, which is the hardest kind of bug to notice.
 *
 * @param {Uint8Array} bytes
 * @param {Array<{start: number, end: number}>} ranges
 * @returns {Uint8Array}
 */
export function removeRanges(bytes, ranges) {
  if (!ranges || ranges.length === 0) return bytes.slice();

  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ start: range.start, end: range.end });
    }
  }

  const removed = merged.reduce((sum, r) => sum + (r.end - r.start), 0);
  const output = new Uint8Array(bytes.length - removed);

  let write = 0;
  let read = 0;
  for (const range of merged) {
    const chunk = range.start - read;
    if (chunk > 0) {
      output.set(bytes.subarray(read, range.start), write);
      write += chunk;
    }
    read = range.end;
  }
  if (read < bytes.length) output.set(bytes.subarray(read), write);

  return output;
}

/**
 * Strips metadata from an image, returning the new bytes and what was removed.
 *
 * @param {Uint8Array} bytes
 * @param {string} mime
 * @param {{keepColourProfile?: boolean}} [options]
 * @returns {{ok: true, bytes: Uint8Array, removed: Array, bytesRemoved: number} | {ok: false, error: string}}
 */
export function stripMetadata(bytes, mime, options = {}) {
  const found = findMetadata(bytes, mime);
  if (!found.ok) return found;

  // The colour profile is the one piece of metadata with a visible
  // consequence: drop an ICC profile from a wide-gamut photo and the colours
  // shift, usually flatter. It carries nothing personal, so it is kept by
  // default and removing it is an explicit choice rather than a surprise.
  const target = options.keepColourProfile === false
    ? found.segments
    : found.segments.filter((segment) => segment.kind !== "icc");

  const output = removeRanges(bytes, target);

  return {
    ok: true,
    bytes: output,
    removed: target,
    bytesRemoved: bytes.length - output.length,
  };
}

/**
 * Summarises found metadata into one line per kind, for display.
 *
 * Grouped by kind rather than listed per segment: a file can carry four APP2
 * ICC chunks (a profile too big for one segment) and reporting "4 colour
 * profiles" would be both wrong and alarming.
 *
 * @param {Array<{kind: string, size: number}>} segments
 * @returns {Array<{kind: string, label: string, count: number, bytes: number}>}
 */
export function summarizeMetadata(segments) {
  const groups = new Map();

  for (const segment of segments || []) {
    const existing = groups.get(segment.kind);
    if (existing) {
      existing.count += 1;
      existing.bytes += segment.size;
    } else {
      groups.set(segment.kind, {
        kind: segment.kind,
        label: METADATA_KINDS[segment.kind] || METADATA_KINDS.other,
        count: 1,
        bytes: segment.size,
      });
    }
  }

  // Ordered by the order METADATA_KINDS declares, so EXIF — the one people
  // came here for — is always first rather than wherever it happened to sit
  // in the file.
  const order = Object.keys(METADATA_KINDS);
  return [...groups.values()].sort(
    (a, b) => order.indexOf(a.kind) - order.indexOf(b.kind)
  );
}

/**
 * True if the found metadata includes GPS coordinates.
 *
 * Called out separately in the UI because it is categorically different from
 * the rest: a lens model is trivia, a location is someone's home address. This
 * checks for the GPS IFD pointer tag (0x8825) inside the EXIF TIFF structure
 * rather than assuming EXIF implies GPS, which would cry wolf on every photo
 * from a camera without a GPS chip.
 *
 * @param {Uint8Array} bytes Whole file.
 * @param {Array<{kind: string, start: number, end: number}>} segments
 * @returns {boolean}
 */
export function hasGpsData(bytes, segments) {
  const exif = (segments || []).find((segment) => segment.kind === "exif");
  if (!exif) return false;

  // Find the TIFF header inside the segment. In JPEG it follows "Exif\0\0";
  // in a PNG eXIf chunk the TIFF header may start immediately. Scanning for
  // the byte-order mark within a bounded window handles both without needing
  // to know which container we came from.
  let tiff = -1;
  const searchEnd = Math.min(exif.start + 64, exif.end - 8);
  for (let i = exif.start; i < searchEnd; i++) {
    const isLittle = bytes[i] === 0x49 && bytes[i + 1] === 0x49 && bytes[i + 2] === 0x2a;
    const isBig = bytes[i] === 0x4d && bytes[i + 1] === 0x4d && bytes[i + 3] === 0x2a;
    if (isLittle || isBig) {
      tiff = i;
      break;
    }
  }
  if (tiff < 0) return false;

  const little = bytes[tiff] === 0x49;
  const u16 = (offset) =>
    little ? bytes[offset] + (bytes[offset + 1] << 8) : readUint16(bytes, offset);
  const u32 = (offset) =>
    little
      ? bytes[offset] +
        (bytes[offset + 1] << 8) +
        (bytes[offset + 2] << 16) +
        ((bytes[offset + 3] << 24) >>> 0)
      : readUint32(bytes, offset);

  const ifdOffset = u32(tiff + 4);
  const ifd = tiff + ifdOffset;
  if (ifd + 2 > exif.end || ifd < tiff) return false;

  const count = u16(ifd);
  // A plausible IFD has a bounded entry count; a wild number means we are
  // reading something that is not an IFD and should stop rather than scan.
  if (count > 512) return false;

  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > exif.end) return false;
    if (u16(entry) === 0x8825) return true; // GPSInfo IFD pointer
  }

  return false;
}
