import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { imageSize } from "./imageSize";

// Byte-level fixtures rather than real files: the whole module reads headers,
// so a synthetic header exercises exactly the code under test and documents
// the layout of each format in the process.

function png(width, height) {
  const bytes = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

// A JPEG with `padding` bytes of unrelated segments before the SOF0 marker,
// standing in for the EXIF/ICC blocks that push SOF deep into real files.
function jpeg(width, height, { padding = 0, marker = 0xc0 } = {}) {
  const parts = [Buffer.from([0xff, 0xd8])];

  if (padding > 0) {
    const segment = Buffer.alloc(padding + 4);
    segment[0] = 0xff;
    segment[1] = 0xe1; // APP1, where EXIF lives
    segment.writeUInt16BE(padding + 2, 2);
    parts.push(segment);
  }

  const sof = Buffer.alloc(11);
  sof[0] = 0xff;
  sof[1] = marker;
  sof.writeUInt16BE(9, 2); // segment length
  sof[4] = 8; // sample precision
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  parts.push(sof);

  return Buffer.concat(parts);
}

function webpVp8x(width, height) {
  const bytes = Buffer.alloc(32);
  bytes.write("RIFF", 0, "ascii");
  bytes.write("WEBP", 8, "ascii");
  bytes.write("VP8X", 12, "ascii");
  bytes.writeUIntLE(width - 1, 24, 3);
  bytes.writeUIntLE(height - 1, 27, 3);
  return bytes;
}

function webpLossy(width, height) {
  const bytes = Buffer.alloc(32);
  bytes.write("RIFF", 0, "ascii");
  bytes.write("WEBP", 8, "ascii");
  bytes.write("VP8 ", 12, "ascii");
  bytes.writeUInt16LE(width, 26);
  bytes.writeUInt16LE(height, 28);
  return bytes;
}

function webpLossless(width, height) {
  const bytes = Buffer.alloc(32);
  bytes.write("RIFF", 0, "ascii");
  bytes.write("WEBP", 8, "ascii");
  bytes.write("VP8L", 12, "ascii");
  bytes[20] = 0x2f; // VP8L signature byte
  const packed = (width - 1) | ((height - 1) << 14);
  bytes.writeUInt32LE(packed >>> 0, 21);
  return bytes;
}

describe("imageSize", () => {
  it("reads PNG dimensions", () => {
    expect(imageSize(png(1200, 630))).toEqual({ width: 1200, height: 630 });
  });

  it("reads JPEG dimensions", () => {
    expect(imageSize(jpeg(1200, 630))).toEqual({ width: 1200, height: 630 });
  });

  // The reason the marker chain is walked rather than indexed: a real photo's
  // SOF sits after EXIF, ICC and often an embedded thumbnail.
  it("finds the JPEG SOF marker past a large EXIF block", () => {
    expect(imageSize(jpeg(1424, 752, { padding: 4000 }))).toEqual({
      width: 1424,
      height: 752,
    });
  });

  it("reads every SOF variant", () => {
    for (const marker of [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc9, 0xca]) {
      expect(imageSize(jpeg(800, 400, { marker }))).toEqual({ width: 800, height: 400 });
    }
  });

  // DHT/JPG/DAC sit inside the SOF numeric range but are not frame headers;
  // reading one as SOF yields plausible nonsense rather than an error.
  it("does not mistake DHT, JPG or DAC markers for a frame header", () => {
    for (const marker of [0xc4, 0xc8, 0xcc]) {
      expect(imageSize(jpeg(800, 400, { marker }))).toBeNull();
    }
  });

  it("reads WebP VP8X (extended) dimensions", () => {
    expect(imageSize(webpVp8x(1424, 752))).toEqual({ width: 1424, height: 752 });
  });

  it("reads WebP VP8 (lossy) dimensions", () => {
    expect(imageSize(webpLossy(1200, 630))).toEqual({ width: 1200, height: 630 });
  });

  it("reads WebP VP8L (lossless) dimensions", () => {
    expect(imageSize(webpLossless(1200, 630))).toEqual({ width: 1200, height: 630 });
  });

  it("returns null for an unrecognised format", () => {
    expect(imageSize(Buffer.from("not an image at all, just text here"))).toBeNull();
  });

  it("returns null for a truncated or empty buffer", () => {
    expect(imageSize(Buffer.alloc(4))).toBeNull();
    expect(imageSize(Buffer.alloc(0))).toBeNull();
    expect(imageSize(null)).toBeNull();
  });

  // This module parses untrusted files, so a malformed length must yield
  // "can't read this" rather than a hang — the same guard imageMetadata.js
  // carries.
  it("terminates on a malformed JPEG length rather than looping forever", () => {
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x00, 0, 0, 0, 0, 0, 0]);
    expect(imageSize(bytes)).toBeNull();
  });

  it("returns for random bytes", () => {
    for (let i = 0; i < 200; i += 1) {
      const bytes = Buffer.alloc(64);
      for (let j = 0; j < bytes.length; j += 1) bytes[j] = Math.floor(Math.random() * 256);
      expect(() => imageSize(bytes)).not.toThrow();
    }
  });
});

// Asserted against the real committed cover, not a fixture: this is what
// catches a cover being replaced with a file whose header this cannot read,
// which is the failure that would otherwise reach og:image as a missing size.
describe("committed blog covers", () => {
  const dir = path.join(process.cwd(), "public", "blog");
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((name) => /\.(png|jpe?g|webp)$/i.test(name))
    : [];

  for (const file of files) {
    it(`${file} has readable dimensions`, () => {
      const bytes = fs.readFileSync(path.join(dir, file)).subarray(0, 64 * 1024);
      const size = imageSize(bytes);
      expect(size).not.toBeNull();
      expect(size.width).toBeGreaterThanOrEqual(1200);
    });
  }
});
