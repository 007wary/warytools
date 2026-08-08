import { describe, it, expect } from "vitest";
import {
  findJpegMetadata,
  findPngMetadata,
  findMetadata,
  removeRanges,
  stripMetadata,
  summarizeMetadata,
  hasGpsData,
  METADATA_KINDS,
} from "./imageMetadata";

// Building real files byte by byte rather than checking in fixtures. These
// formats are simple enough to construct exactly, and a hand-built file makes
// the test state what it is asserting about — "this JPEG has an EXIF segment
// of 20 bytes at offset 2" — instead of hiding it in a binary blob nobody can
// read in a diff.

function jpegSegment(marker, payload) {
  const length = payload.length + 2;
  return [0xff, marker, (length >> 8) & 0xff, length & 0xff, ...payload];
}

function ascii(text) {
  return [...text].map((char) => char.charCodeAt(0));
}

/** A minimal but structurally valid JPEG with the given segments. */
function buildJpeg(segments = []) {
  return new Uint8Array([
    0xff, 0xd8, // SOI
    ...segments.flat(),
    0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, // SOS
    0x11, 0x22, 0x33, 0xff, 0x00, 0x44, // scan data, incl. a stuffed 0xFF
    0xff, 0xd9, // EOI
  ]);
}

const exifSegment = jpegSegment(0xe1, [...ascii("Exif"), 0x00, 0x00, 0xde, 0xad, 0xbe, 0xef]);
const xmpSegment = jpegSegment(0xe1, [...ascii("http://ns.adobe.com/xap/1.0/"), 0x00, 0x01]);
const iccSegment = jpegSegment(0xe2, [...ascii("ICC_PROFILE"), 0x00, 0x01, 0x01, 0x99]);
const jfifSegment = jpegSegment(0xe0, [...ascii("JFIF"), 0x00, 0x01, 0x02, 0x00, 0x00, 0x01]);
const commentSegment = jpegSegment(0xfe, ascii("shot on my phone"));
const iptcSegment = jpegSegment(0xed, [...ascii("Photoshop 3.0"), 0x00, 0x42]);

function pngChunk(type, data = []) {
  const length = data.length;
  return [
    (length >>> 24) & 0xff,
    (length >>> 16) & 0xff,
    (length >>> 8) & 0xff,
    length & 0xff,
    ...ascii(type),
    ...data,
    0x00, 0x00, 0x00, 0x00, // CRC — not validated by the walker
  ];
}

function buildPng(chunks = []) {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...pngChunk("IHDR", [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]),
    ...chunks.flat(),
    ...pngChunk("IDAT", [0x78, 0x9c, 0x63, 0x00]),
    ...pngChunk("IEND"),
  ]);
}

describe("findJpegMetadata", () => {
  it("rejects a file that isn't a JPEG", () => {
    const result = findJpegMetadata(new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/isn't a JPEG/);
  });

  it("rejects a file too short to hold a header", () => {
    expect(findJpegMetadata(new Uint8Array([0xff])).ok).toBe(false);
    expect(findJpegMetadata(new Uint8Array()).ok).toBe(false);
    expect(findJpegMetadata(null).ok).toBe(false);
  });

  it("finds nothing in a JPEG with no metadata", () => {
    const result = findJpegMetadata(buildJpeg());
    expect(result.ok).toBe(true);
    expect(result.segments).toEqual([]);
  });

  it("classifies EXIF, XMP, ICC, IPTC and comments distinctly", () => {
    const result = findJpegMetadata(
      buildJpeg([exifSegment, xmpSegment, iccSegment, iptcSegment, commentSegment])
    );
    expect(result.ok).toBe(true);
    expect(result.segments.map((s) => s.kind)).toEqual([
      "exif",
      "xmp",
      "icc",
      "iptc",
      "comment",
    ]);
  });

  it("does not treat the JFIF header as metadata", () => {
    // JFIF is structural — it describes pixel density, carries nothing
    // personal, and some decoders are unhappy without it.
    const result = findJpegMetadata(buildJpeg([jfifSegment]));
    expect(result.ok).toBe(true);
    expect(result.segments).toEqual([]);
  });

  it("stops at the start of scan rather than parsing compressed data", () => {
    // The scan data in buildJpeg contains a 0xFF byte. If the walker kept
    // going it would read that as a marker and either fail or invent a
    // segment inside the image data.
    const result = findJpegMetadata(buildJpeg([exifSegment]));
    expect(result.ok).toBe(true);
    expect(result.segments).toHaveLength(1);
  });

  it("reports a segment range that starts at its 0xFF marker byte", () => {
    const bytes = buildJpeg([exifSegment]);
    const { segments } = findJpegMetadata(bytes);
    expect(bytes[segments[0].start]).toBe(0xff);
    expect(bytes[segments[0].start + 1]).toBe(0xe1);
    expect(segments[0].size).toBe(exifSegment.length);
  });

  it("refuses a segment whose length overruns the file", () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xf0, 0x00]);
    const result = findJpegMetadata(bytes);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/ends unexpectedly/);
  });

  it("refuses a length field below the 2 bytes it counts itself", () => {
    // A zero length would leave the walk offset unchanged and spin forever.
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x00, 0xff, 0xd9]);
    const result = findJpegMetadata(bytes);
    expect(result.ok).toBe(false);
  });

  it("terminates on a buffer of random bytes", () => {
    // Fuzz-lite: the walker reads untrusted input, and the requirement is
    // that it always returns rather than hanging or throwing.
    for (let seed = 0; seed < 200; seed++) {
      const bytes = new Uint8Array(64);
      bytes[0] = 0xff;
      bytes[1] = 0xd8;
      for (let i = 2; i < bytes.length; i++) {
        bytes[i] = (seed * 7919 + i * 131) % 256;
      }
      expect(() => findJpegMetadata(bytes)).not.toThrow();
    }
  });
});

describe("findPngMetadata", () => {
  it("rejects a file that isn't a PNG", () => {
    const result = findPngMetadata(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/isn't a PNG/);
  });

  it("finds nothing in a PNG carrying only image chunks", () => {
    const result = findPngMetadata(buildPng());
    expect(result.ok).toBe(true);
    expect(result.segments).toEqual([]);
  });

  it("finds text, EXIF, time and colour-profile chunks", () => {
    const result = findPngMetadata(
      buildPng([
        pngChunk("tEXt", ascii("Software\0Adobe")),
        pngChunk("eXIf", [0x49, 0x49, 0x2a, 0x00]),
        pngChunk("tIME", [0x07, 0xe8, 1, 1, 0, 0, 0]),
        pngChunk("iCCP", ascii("profile\0")),
      ])
    );
    expect(result.ok).toBe(true);
    expect(result.segments.map((s) => s.kind)).toEqual(["comment", "exif", "other", "icc"]);
  });

  it("leaves rendering-relevant chunks alone", () => {
    // Dropping any of these changes how the image looks, which is not what
    // "strip metadata" means to anybody.
    const result = findPngMetadata(
      buildPng([
        pngChunk("PLTE", [1, 2, 3]),
        pngChunk("tRNS", [0xff]),
        pngChunk("gAMA", [0, 1, 0, 0]),
        pngChunk("sRGB", [0]),
      ])
    );
    expect(result.ok).toBe(true);
    expect(result.segments).toEqual([]);
  });

  it("refuses a chunk length that overruns the file", () => {
    const bytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x7f, 0xff, 0xff, 0xff, ...ascii("tEXt"),
    ]);
    const result = findPngMetadata(bytes);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/ends unexpectedly/);
  });

  it("terminates on a buffer of random bytes", () => {
    for (let seed = 0; seed < 200; seed++) {
      const bytes = new Uint8Array(64);
      bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      for (let i = 8; i < bytes.length; i++) {
        bytes[i] = (seed * 6421 + i * 97) % 256;
      }
      expect(() => findPngMetadata(bytes)).not.toThrow();
    }
  });
});

describe("removeRanges", () => {
  const source = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

  it("returns a copy when there is nothing to remove", () => {
    const output = removeRanges(source, []);
    expect([...output]).toEqual([...source]);
    expect(output).not.toBe(source);
  });

  it("excises a single range", () => {
    expect([...removeRanges(source, [{ start: 3, end: 6 }])]).toEqual([0, 1, 2, 6, 7, 8, 9]);
  });

  it("excises several ranges", () => {
    const output = removeRanges(source, [
      { start: 1, end: 3 },
      { start: 6, end: 8 },
    ]);
    expect([...output]).toEqual([0, 3, 4, 5, 8, 9]);
  });

  it("handles ranges given out of order", () => {
    // The caller assembles ranges from a walk; if an unsorted list spliced
    // the wrong bytes the result would still open in some viewers, which is
    // the hardest kind of corruption to notice.
    const output = removeRanges(source, [
      { start: 6, end: 8 },
      { start: 1, end: 3 },
    ]);
    expect([...output]).toEqual([0, 3, 4, 5, 8, 9]);
  });

  it("merges overlapping and adjacent ranges", () => {
    expect([...removeRanges(source, [
      { start: 2, end: 5 },
      { start: 4, end: 7 },
    ])]).toEqual([0, 1, 7, 8, 9]);

    expect([...removeRanges(source, [
      { start: 2, end: 4 },
      { start: 4, end: 6 },
    ])]).toEqual([0, 1, 6, 7, 8, 9]);
  });

  it("handles a range running to the end of the buffer", () => {
    expect([...removeRanges(source, [{ start: 7, end: 10 }])]).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("handles a range starting at zero", () => {
    expect([...removeRanges(source, [{ start: 0, end: 4 }])]).toEqual([4, 5, 6, 7, 8, 9]);
  });
});

describe("stripMetadata", () => {
  it("removes EXIF from a JPEG and leaves the file otherwise identical", () => {
    // The core promise of the tool: the only bytes that change are the ones
    // that were metadata. This asserts on the actual output rather than
    // recomputing the offsets — a test that re-derives the ranges would pass
    // even if the splice were wrong.
    const clean = buildJpeg();
    const dirty = buildJpeg([exifSegment]);

    const result = stripMetadata(dirty, "image/jpeg");
    expect(result.ok).toBe(true);
    expect([...result.bytes]).toEqual([...clean]);
    expect(result.bytesRemoved).toBe(exifSegment.length);
  });

  it("leaves the compressed scan data byte-for-byte untouched", () => {
    // The whole reason this tool doesn't go through canvas. The scan data
    // here contains a stuffed 0xFF, which is also the case most likely to be
    // mangled by a careless walker.
    const dirty = buildJpeg([exifSegment, commentSegment]);
    const result = stripMetadata(dirty, "image/jpeg");

    const scanOf = (bytes) => {
      const index = bytes.findIndex((b, i) => b === 0xff && bytes[i + 1] === 0xda);
      return [...bytes.subarray(index)];
    };
    expect(scanOf(result.bytes)).toEqual(scanOf(dirty));
  });

  it("keeps the colour profile by default", () => {
    // Removing an ICC profile visibly shifts colour, and it carries nothing
    // personal — so it survives unless explicitly asked for.
    const dirty = buildJpeg([exifSegment, iccSegment]);
    const result = stripMetadata(dirty, "image/jpeg");

    expect(result.removed.map((s) => s.kind)).toEqual(["exif"]);
    expect(findJpegMetadata(result.bytes).segments.map((s) => s.kind)).toEqual(["icc"]);
  });

  it("removes the colour profile when asked", () => {
    const dirty = buildJpeg([exifSegment, iccSegment]);
    const result = stripMetadata(dirty, "image/jpeg", { keepColourProfile: false });

    expect(result.removed.map((s) => s.kind)).toEqual(["exif", "icc"]);
    expect(findJpegMetadata(result.bytes).segments).toEqual([]);
  });

  it("produces a file the walker then finds nothing in", () => {
    // Round trip rather than recomputation: strip, re-parse the real output,
    // and assert it is clean. This is what catches an off-by-one that leaves
    // a marker stub behind.
    const dirty = buildJpeg([exifSegment, xmpSegment, iptcSegment, commentSegment]);
    const result = stripMetadata(dirty, "image/jpeg", { keepColourProfile: false });

    const reparsed = findJpegMetadata(result.bytes);
    expect(reparsed.ok).toBe(true);
    expect(reparsed.segments).toEqual([]);
  });

  it("round-trips a PNG to a clean chunk stream", () => {
    const dirty = buildPng([
      pngChunk("tEXt", ascii("Comment\0hello")),
      pngChunk("eXIf", [0x49, 0x49, 0x2a, 0x00]),
    ]);
    const result = stripMetadata(dirty, "image/png");

    expect(result.ok).toBe(true);
    const reparsed = findPngMetadata(result.bytes);
    expect(reparsed.ok).toBe(true);
    expect(reparsed.segments).toEqual([]);
    // IHDR, IDAT and IEND all survive — the image itself is intact.
    expect([...result.bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });

  it("never grows the file", () => {
    const dirty = buildJpeg([exifSegment, xmpSegment, commentSegment]);
    const result = stripMetadata(dirty, "image/jpeg");
    expect(result.bytes.length).toBeLessThan(dirty.length);
  });

  it("is a no-op on a file that has no metadata", () => {
    const clean = buildJpeg([jfifSegment]);
    const result = stripMetadata(clean, "image/jpeg");
    expect([...result.bytes]).toEqual([...clean]);
    expect(result.bytesRemoved).toBe(0);
  });

  it("refuses formats it cannot edit without recompressing", () => {
    const result = stripMetadata(new Uint8Array([0, 1, 2]), "image/webp");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Convert Image/);
  });

  it("propagates a parse failure rather than returning damaged bytes", () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xf0, 0x00]);
    const result = stripMetadata(bytes, "image/jpeg");
    expect(result.ok).toBe(false);
  });
});

describe("findMetadata", () => {
  it("dispatches on the sniffed type", () => {
    expect(findMetadata(buildJpeg([exifSegment]), "image/jpeg").segments).toHaveLength(1);
    expect(
      findMetadata(buildPng([pngChunk("tEXt", ascii("a\0b"))]), "image/png").segments
    ).toHaveLength(1);
  });
});

describe("summarizeMetadata", () => {
  it("groups repeated segments of one kind into a single row", () => {
    // A large ICC profile is legitimately split across several APP2 segments.
    // Reporting "4 colour profiles" would be wrong and alarming.
    const summary = summarizeMetadata([
      { kind: "icc", size: 100 },
      { kind: "icc", size: 200 },
      { kind: "icc", size: 50 },
    ]);
    expect(summary).toHaveLength(1);
    expect(summary[0].count).toBe(3);
    expect(summary[0].bytes).toBe(350);
  });

  it("puts EXIF first regardless of file order", () => {
    // EXIF is what people came for, so it leads the list rather than
    // appearing wherever it happened to sit in the file.
    const summary = summarizeMetadata([
      { kind: "comment", size: 10 },
      { kind: "icc", size: 10 },
      { kind: "exif", size: 10 },
    ]);
    expect(summary[0].kind).toBe("exif");
  });

  it("gives every kind a human label", () => {
    const summary = summarizeMetadata(
      Object.keys(METADATA_KINDS).map((kind) => ({ kind, size: 1 }))
    );
    summary.forEach((row) => {
      expect(row.label).toBeTruthy();
      expect(row.label).not.toMatch(/^(exif|xmp|iptc|icc)$/);
    });
  });

  it("returns an empty list for no segments", () => {
    expect(summarizeMetadata([])).toEqual([]);
    expect(summarizeMetadata(null)).toEqual([]);
  });
});

describe("hasGpsData", () => {
  // A real EXIF block: "Exif\0\0", then a TIFF header, then an IFD whose
  // entries either do or don't include the GPS pointer tag (0x8825).
  function exifWithTags(tags, little = true) {
    const header = [...ascii("Exif"), 0x00, 0x00];
    const tiff = little
      ? [0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]
      : [0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08];

    const count = little
      ? [tags.length & 0xff, (tags.length >> 8) & 0xff]
      : [(tags.length >> 8) & 0xff, tags.length & 0xff];

    const entries = tags.flatMap((tag) => {
      const id = little
        ? [tag & 0xff, (tag >> 8) & 0xff]
        : [(tag >> 8) & 0xff, tag & 0xff];
      return [...id, 0x03, 0x00, 1, 0, 0, 0, 0, 0, 0, 0];
    });

    return jpegSegment(0xe1, [...header, ...tiff, ...count, ...entries]);
  }

  it("reports GPS when the GPSInfo pointer tag is present", () => {
    const bytes = buildJpeg([exifWithTags([0x010f, 0x8825])]);
    const { segments } = findJpegMetadata(bytes);
    expect(hasGpsData(bytes, segments)).toBe(true);
  });

  it("does not report GPS for EXIF without a location", () => {
    // A camera with no GPS chip still writes plenty of EXIF. Assuming EXIF
    // implies GPS would cry wolf on most photos and make the warning
    // meaningless on the ones that matter.
    const bytes = buildJpeg([exifWithTags([0x010f, 0x0110, 0x9003])]);
    const { segments } = findJpegMetadata(bytes);
    expect(hasGpsData(bytes, segments)).toBe(false);
  });

  it("reads big-endian EXIF as well as little-endian", () => {
    const bytes = buildJpeg([exifWithTags([0x8825], false)]);
    const { segments } = findJpegMetadata(bytes);
    expect(hasGpsData(bytes, segments)).toBe(true);
  });

  it("is false when there is no EXIF at all", () => {
    const bytes = buildJpeg([commentSegment]);
    const { segments } = findJpegMetadata(bytes);
    expect(hasGpsData(bytes, segments)).toBe(false);
  });

  it("is false rather than throwing on a truncated EXIF block", () => {
    const bytes = buildJpeg([jpegSegment(0xe1, [...ascii("Exif"), 0x00, 0x00, 0x49, 0x49])]);
    const { segments } = findJpegMetadata(bytes);
    expect(() => hasGpsData(bytes, segments)).not.toThrow();
    expect(hasGpsData(bytes, segments)).toBe(false);
  });
});
