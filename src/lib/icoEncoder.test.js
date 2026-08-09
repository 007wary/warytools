import { describe, it, expect } from "vitest";
import { encodeIco, readIcoDirectory, looksLikePngAt, MAX_ICO_SIZE } from "./icoEncoder";

// A minimal but structurally real PNG: the 8-byte signature followed by
// filler. The encoder never parses the payload — it only measures and copies
// it — so the signature is the only part that has to be genuine, and it's
// what lets the offset assertions below check that each entry points at the
// start of an image rather than into the middle of its neighbour.
function fakePng(fillByte, length = 40) {
  const bytes = new Uint8Array(length);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.fill(fillByte, 8);
  return bytes;
}

function image(size, fillByte, length) {
  return { width: size, height: size, bytes: fakePng(fillByte, length) };
}

describe("encodeIco", () => {
  it("writes a directory header naming the image count", () => {
    const ico = encodeIco([image(16, 0xaa), image(32, 0xbb)]);
    const view = new DataView(ico.buffer);

    expect(view.getUint16(0, true)).toBe(0); // reserved
    expect(view.getUint16(2, true)).toBe(1); // 1 = icon, not cursor
    expect(view.getUint16(4, true)).toBe(2);
  });

  it("sizes the file as header + entries + payloads exactly", () => {
    const images = [image(16, 0xaa, 40), image(32, 0xbb, 90)];
    const ico = encodeIco(images);

    expect(ico.length).toBe(6 + 2 * 16 + 40 + 90);
  });

  // The check that matters. Recomputing the offsets the same way the encoder
  // does would pass even if the arithmetic were wrong in both places; parsing
  // the file back with an independent reader and confirming every declared
  // offset lands on a PNG signature is a genuine round trip.
  it("round-trips: every declared offset lands on the start of a PNG", () => {
    const ico = encodeIco([image(16, 0xaa, 40), image(32, 0xbb, 90), image(48, 0xcc, 31)]);
    const { count, entries } = readIcoDirectory(ico);

    expect(count).toBe(3);
    entries.forEach((entry) => {
      expect(looksLikePngAt(ico, entry.offset)).toBe(true);
    });
  });

  it("round-trips the declared length back to the original payload bytes", () => {
    const first = fakePng(0xaa, 40);
    const second = fakePng(0xbb, 90);

    const ico = encodeIco([
      { width: 16, height: 16, bytes: first },
      { width: 32, height: 32, bytes: second },
    ]);
    const { entries } = readIcoDirectory(ico);

    expect(ico.slice(entries[0].offset, entries[0].offset + entries[0].length)).toEqual(first);
    expect(ico.slice(entries[1].offset, entries[1].offset + entries[1].length)).toEqual(second);
  });

  it("round-trips dimensions, including the 0-means-256 rule", () => {
    const ico = encodeIco([image(16, 0xaa), image(256, 0xbb)]);
    const { entries } = readIcoDirectory(ico);

    expect(entries[0].width).toBe(16);
    expect(entries[1].width).toBe(MAX_ICO_SIZE);

    // The byte on disk for a 256px entry must literally be zero — this is the
    // spec's encoding, and writing 256 would truncate to the same value by
    // accident while meaning something different.
    expect(ico[6 + 16 + 0]).toBe(0);
    expect(ico[6 + 0]).toBe(16);
  });

  it("preserves the order it was given", () => {
    const ico = encodeIco([image(48, 0xcc), image(16, 0xaa), image(32, 0xbb)]);
    const { entries } = readIcoDirectory(ico);

    expect(entries.map((entry) => entry.width)).toEqual([48, 16, 32]);
  });

  it("declares 1 colour plane and 32-bit depth", () => {
    const ico = encodeIco([image(32, 0xaa)]);
    const view = new DataView(ico.buffer);

    expect(view.getUint16(6 + 4, true)).toBe(1);
    expect(view.getUint16(6 + 6, true)).toBe(32);
  });

  it("accepts an ArrayBuffer as well as a Uint8Array", () => {
    const png = fakePng(0xaa, 24);
    const ico = encodeIco([{ width: 16, height: 16, bytes: png.buffer }]);

    expect(looksLikePngAt(ico, readIcoDirectory(ico).entries[0].offset)).toBe(true);
  });

  it("rejects an empty set", () => {
    expect(() => encodeIco([])).toThrow(/at least one image/i);
    expect(() => encodeIco(null)).toThrow(/at least one image/i);
  });

  it("rejects an image the format cannot describe", () => {
    // 512 would be written into a single byte and silently become 0, i.e. 256
    // — a wrong size that reads as valid. Refused instead.
    expect(() => encodeIco([image(512, 0xaa)])).toThrow(/larger than 256/i);
  });

  it("rejects images with no data or a nonsense size", () => {
    expect(() => encodeIco([{ width: 16, height: 16, bytes: new Uint8Array(0) }])).toThrow(
      /no data/i
    );
    expect(() => encodeIco([{ width: 0, height: 16, bytes: fakePng(0xaa) }])).toThrow(
      /invalid size/i
    );
  });
});

describe("readIcoDirectory", () => {
  it("refuses input that is too short or misheaded", () => {
    expect(() => readIcoDirectory(new Uint8Array(3))).toThrow(/too short/i);

    const notAnIco = new Uint8Array(6);
    new DataView(notAnIco.buffer).setUint16(2, 2, true); // type 2 = cursor
    expect(() => readIcoDirectory(notAnIco)).toThrow(/bad directory header/i);
  });

  it("refuses a directory that runs past the end of the file", () => {
    const truncated = new Uint8Array(6 + 16);
    const view = new DataView(truncated.buffer);
    view.setUint16(2, 1, true);
    view.setUint16(4, 4, true); // claims four entries, carries one

    expect(() => readIcoDirectory(truncated)).toThrow(/past the end/i);
  });
});

describe("looksLikePngAt", () => {
  it("is false past the end of the buffer and on non-PNG bytes", () => {
    const bytes = fakePng(0xaa, 40);

    expect(looksLikePngAt(bytes, 0)).toBe(true);
    expect(looksLikePngAt(bytes, 1)).toBe(false);
    expect(looksLikePngAt(bytes, 36)).toBe(false);
    expect(looksLikePngAt(bytes, 9999)).toBe(false);
  });
});
