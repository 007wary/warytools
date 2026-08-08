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
  // Only reachable from a partial (head-only) scan, where a segment's
  // identifier ran past the end of the window. It is still application data
  // and is still removed — we just can't name it in the report, and saying so
  // is better than guessing "Other" or, worse, mislabelling EXIF.
  unknown: "Application data (type not read)",
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
  //
  // `wanted` is where the identifier ends if the whole segment is present;
  // `limit` is how far the buffer actually goes. On a partial scan those
  // differ, and the difference is load-bearing: an identifier cut in half
  // matches none of the prefixes below and would fall through to "other",
  // silently relabelling a photo's EXIF as "Other application data" and
  // taking GPS detection down with it. So a truncated identifier that has
  // not yet matched returns null-and-unknown rather than a confident guess.
  const wanted = start + Math.min(length, 32);
  const limit = Math.min(wanted, bytes.length);

  let id = "";
  let terminated = false;
  for (let i = start; i < limit; i++) {
    const byte = bytes[i];
    if (byte === 0x00) {
      terminated = true;
      break;
    }
    id += String.fromCharCode(byte);
  }

  // Prefix matches are safe to return early even from a partial read: once
  // "ICC_PROFILE" has been seen in full, more bytes cannot change the answer.
  if (id.startsWith("Exif")) return "exif";
  if (id.startsWith("http://ns.adobe.com/xap")) return "xmp";
  if (id.startsWith("http://ns.adobe.com/xmp")) return "xmp";
  // Photoshop IRB — carries IPTC, and also the editor's own saved thumbnail.
  if (id.startsWith("Photoshop")) return "iptc";
  if (id.startsWith("ICC_PROFILE")) return "icc";
  if (id.startsWith("JFIF") || id.startsWith("JFXX")) return null; // structural

  // Nothing matched. If the identifier ran off the end of the buffer before
  // its NUL, we genuinely do not know what this is — say so, rather than
  // asserting "other".
  if (!terminated && limit < wanted) return "unknown";

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
 * `partial` marks `bytes` as a PREFIX of the real file rather than the whole
 * thing, which is how the client scans: only the head is read, because
 * metadata lives at the front of both formats and reading whole files just to
 * report on them would hold a batch's worth of photos in memory. Under it, a
 * segment running past the end of the buffer is reported (with `truncated`)
 * and the walk stops, instead of being called damage. Ranges from a partial
 * walk describe the real file's offsets — the prefix starts at byte 0 — but
 * must NOT be fed to removeRanges against the prefix, only against full bytes.
 *
 * @param {Uint8Array} bytes
 * @param {{partial?: boolean}} [options]
 * @returns {{ok: true, segments: Array<{kind: string, start: number, end: number, size: number, truncated?: boolean}>} | {ok: false, error: string}}
 */
export function findJpegMetadata(bytes, options = {}) {
  const partial = options.partial === true;

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
      if (partial) break;
      return { ok: false, error: "This JPEG ends unexpectedly and can't be edited safely." };
    }

    // The length field includes its own two bytes, so anything under 2 is
    // malformed and would make the walk loop forever. This is a genuine
    // structural defect, not a truncation, so `partial` does not excuse it.
    const length = readUint16(bytes, lengthOffset);
    if (length < 2) {
      return { ok: false, error: "This JPEG's structure is damaged and can't be edited safely." };
    }

    const segmentEnd = lengthOffset + length;
    if (segmentEnd > bytes.length) {
      // Under `partial` this is the expected way a head scan ends: the caller
      // handed us a prefix, and a segment legitimately continues past it. The
      // segment is still REPORTED — its kind and declared length are both
      // known from the header we did read — but the walk stops, since the
      // next marker lies beyond the window.
      //
      // Without this, a photo whose EXIF is larger than the scan window was
      // reported as "This JPEG ends unexpectedly", i.e. a valid file told the
      // user it was damaged. Embedded thumbnails and full ICC profiles push
      // EXIF past any window worth reading, so this is routine, not exotic.
      if (partial) {
        if (marker >= APP0 && marker <= APP15) {
          const kind = classifyAppSegment(bytes, lengthOffset + 2, length - 2);
          if (kind) {
            segments.push({
              kind,
              start: markerOffset - 1,
              end: segmentEnd,
              size: segmentEnd - (markerOffset - 1),
              truncated: true,
            });
          }
        } else if (marker === COM) {
          segments.push({
            kind: "comment",
            start: markerOffset - 1,
            end: segmentEnd,
            size: segmentEnd - (markerOffset - 1),
            truncated: true,
          });
        }
        break;
      }
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
 * See findJpegMetadata for what `partial` means and why it exists.
 *
 * @param {Uint8Array} bytes
 * @param {{partial?: boolean}} [options]
 * @returns {{ok: true, segments: Array<{kind: string, start: number, end: number, size: number, truncated?: boolean}>} | {ok: false, error: string}}
 */
export function findPngMetadata(bytes, options = {}) {
  const partial = options.partial === true;
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

    // A chunk is: 4 length + 4 type + data + 4 CRC. The type is read before the
    // length is range-checked so that a chunk continuing past a partial
    // window can still be classified and reported — the four type bytes sit
    // immediately after the length and are always present here.
    const chunkEnd = offset + 12 + length;
    const type =
      String.fromCharCode(bytes[offset + 4]) +
      String.fromCharCode(bytes[offset + 5]) +
      String.fromCharCode(bytes[offset + 6]) +
      String.fromCharCode(bytes[offset + 7]);

    // A length that overruns the buffer means the file is truncated or lying.
    // On a whole file that is damage and the safe answer is to refuse. On a
    // deliberate prefix it is the expected end of the window — see
    // findJpegMetadata for the full reasoning.
    if (length > bytes.length || chunkEnd > bytes.length) {
      if (partial) {
        if (PNG_METADATA_CHUNKS[type]) {
          segments.push({
            kind: PNG_METADATA_CHUNKS[type],
            start: offset,
            end: chunkEnd,
            size: chunkEnd - offset,
            truncated: true,
          });
        }
        break;
      }
      return { ok: false, error: "This PNG ends unexpectedly and can't be edited safely." };
    }

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
 * @param {{partial?: boolean}} [options] See findJpegMetadata.
 */
export function findMetadata(bytes, mime, options = {}) {
  if (mime === "image/jpeg") return findJpegMetadata(bytes, options);
  if (mime === "image/png") return findPngMetadata(bytes, options);
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
  // Deliberately NOT forwarding `partial`. Stripping always walks the whole
  // file: a prefix walk's ranges can name bytes the prefix doesn't contain,
  // and splicing those out of a truncated buffer would write a corrupt image
  // that still opens in some viewers. The client scans a head for the report
  // and re-reads the full file for this — the two walks are separate on
  // purpose, and this is the one place that separation has to be enforced.
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
