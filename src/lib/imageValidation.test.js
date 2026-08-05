import { describe, it, expect } from "vitest";
import {
  sniffImageType,
  isUndecodable,
  validateImageFile,
  validateImageFiles,
  describeImageRejections,
  checkPixelBudget,
  describeImageError,
  MAX_IMAGE_BYTES,
  MAX_CANVAS_PIXELS,
} from "./imageValidation";

// Header builders for each format's real signature.
const jpeg = () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const png = () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const gif = () => new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
const bmp = () => new Uint8Array([0x42, 0x4d, 0x00, 0x00]);

// "RIFF" + 4 size bytes + a 4-byte brand at offset 8.
const riff = (brand) => {
  const bytes = new Uint8Array(16);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  bytes.set([...brand].map((c) => c.charCodeAt(0)), 8);
  return bytes;
};

// ISO-BMFF: 4 size bytes + "ftyp" + a 4-byte brand at offset 8.
const isobmff = (brand) => {
  const bytes = new Uint8Array(16);
  bytes.set([0x00, 0x00, 0x00, 0x20], 0);
  bytes.set([0x66, 0x74, 0x79, 0x70], 4);
  bytes.set([...brand].map((c) => c.charCodeAt(0)), 8);
  return bytes;
};

function fakeFile({ name = "photo.jpg", type = "image/jpeg", header = null, size = null } = {}) {
  const bytes = header || jpeg();
  return {
    name,
    type,
    size: size === null ? bytes.length : size,
    slice: () => ({ arrayBuffer: async () => bytes.buffer }),
  };
}

describe("sniffImageType", () => {
  it("identifies JPEG", () => {
    expect(sniffImageType(jpeg())).toBe("image/jpeg");
  });

  it("identifies PNG", () => {
    expect(sniffImageType(png())).toBe("image/png");
  });

  it("identifies GIF", () => {
    expect(sniffImageType(gif())).toBe("image/gif");
  });

  it("identifies BMP", () => {
    expect(sniffImageType(bmp())).toBe("image/bmp");
  });

  // WebP identifies itself at offset 8, after RIFF's four size bytes — a
  // naive offset-0 check would miss it entirely.
  it("identifies WebP past the RIFF size field", () => {
    expect(sniffImageType(riff("WEBP"))).toBe("image/webp");
  });

  it("identifies AVIF by its ISO-BMFF brand", () => {
    expect(sniffImageType(isobmff("avif"))).toBe("image/avif");
  });

  it("identifies HEIC in both common brands", () => {
    expect(sniffImageType(isobmff("heic"))).toBe("image/heic");
    expect(sniffImageType(isobmff("heix"))).toBe("image/heic");
  });

  it("rejects a PDF header", () => {
    expect(sniffImageType(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe(null);
  });

  it("rejects a RIFF container that isn't WebP (e.g. a .wav)", () => {
    expect(sniffImageType(riff("WAVE"))).toBe(null);
  });

  it("handles short and empty input without throwing", () => {
    expect(sniffImageType(new Uint8Array([0xff]))).toBe(null);
    expect(sniffImageType(new Uint8Array([]))).toBe(null);
    expect(sniffImageType(null)).toBe(null);
  });
});

describe("isUndecodable", () => {
  // The case that matters: HEIC is the iPhone default and no browser decodes
  // it via canvas. The old tools accepted it and failed at the draw step with
  // "Could not convert this image", which reads as a broken tool.
  it("flags HEIC and HEIF", () => {
    expect(isUndecodable("image/heic")).toBe(true);
    expect(isUndecodable("image/heif")).toBe(true);
  });

  it("does not flag formats browsers can decode", () => {
    expect(isUndecodable("image/jpeg")).toBe(false);
    expect(isUndecodable("image/avif")).toBe(false);
  });
});

describe("validateImageFile", () => {
  it("accepts a real JPEG", async () => {
    const result = await validateImageFile(fakeFile());
    expect(result.ok).toBe(true);
    expect(result.type).toBe("image/jpeg");
  });

  // The central fix, matching pdfFile.js: File.type comes from the OS mime
  // registry, not the bytes, and is routinely empty on Android and for files
  // restored from an archive.
  it("accepts a valid image whose mime type is empty", async () => {
    const result = await validateImageFile(fakeFile({ type: "", header: png() }));
    expect(result.ok).toBe(true);
    expect(result.type).toBe("image/png");
  });

  // The old `type.startsWith("image/")` check trusted the label completely.
  it("rejects a non-image that claims to be one", async () => {
    const result = await validateImageFile(
      fakeFile({ type: "image/png", header: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]) })
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/isn't an image we recognise/);
  });

  it("gives HEIC an actionable message rather than a generic rejection", async () => {
    const result = await validateImageFile(
      fakeFile({ name: "IMG_0001.HEIC", type: "", header: isobmff("heic") })
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Most Compatible/);
  });

  it("rejects a zero-byte file", async () => {
    const result = await validateImageFile(fakeFile({ size: 0 }));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/empty/);
  });

  it("rejects a file past the size limit", async () => {
    const result = await validateImageFile(fakeFile({ size: MAX_IMAGE_BYTES + 1 }));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/50 MB limit/);
  });

  it("reports a read failure separately from an unrecognised format", async () => {
    const result = await validateImageFile({
      name: "gone.jpg",
      type: "image/jpeg",
      size: 100,
      slice: () => ({
        arrayBuffer: async () => {
          throw new Error("NotFoundError");
        },
      }),
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/moved or deleted/);
  });
});

describe("validateImageFiles", () => {
  it("keeps the valid files and reports the rest", async () => {
    const good = fakeFile({ name: "a.jpg" });
    const bad = fakeFile({ name: "b.pdf", header: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]) });

    const { accepted, rejected } = await validateImageFiles([good, bad]);
    expect(accepted).toHaveLength(1);
    expect(accepted[0].file.name).toBe("a.jpg");
    expect(accepted[0].type).toBe("image/jpeg");
    expect(rejected).toHaveLength(1);
    expect(rejected[0].name).toBe("b.pdf");
  });

  it("preserves input order", async () => {
    const files = [fakeFile({ name: "1.jpg" }), fakeFile({ name: "2.jpg" })];
    const { accepted } = await validateImageFiles(files);
    expect(accepted.map((a) => a.file.name)).toEqual(["1.jpg", "2.jpg"]);
  });

  it("handles an empty selection", async () => {
    const { accepted, rejected } = await validateImageFiles([]);
    expect(accepted).toEqual([]);
    expect(rejected).toEqual([]);
  });
});

describe("describeImageRejections", () => {
  it("returns nothing when everything was accepted", () => {
    expect(describeImageRejections([])).toBe("");
  });

  it("gives the full reason for a single rejection", () => {
    const text = describeImageRejections([{ name: "a.heic", error: "HEIC isn't supported." }]);
    expect(text).toContain("a.heic");
    expect(text).toContain("HEIC isn't supported.");
  });

  it("summarises several rejections by name", () => {
    const text = describeImageRejections([
      { name: "a.pdf", error: "x" },
      { name: "b.txt", error: "y" },
    ]);
    expect(text).toMatch(/Skipped 2 files/);
  });
});

describe("checkPixelBudget", () => {
  // Past the canvas ceiling, operations don't throw — they silently produce a
  // blank image, so the user downloads an empty file. Catching it up front is
  // the only way to say anything useful.
  it("accepts an image within the canvas limit", () => {
    expect(checkPixelBudget(4000, 3000).ok).toBe(true);
  });

  it("accepts exactly the limit", () => {
    expect(checkPixelBudget(4096, 4096).ok).toBe(true);
    expect(4096 * 4096).toBe(MAX_CANVAS_PIXELS);
  });

  it("rejects past the limit and reports the megapixel count", () => {
    const result = checkPixelBudget(12000, 9000);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/108 megapixels/);
  });
});

describe("describeImageError", () => {
  it("identifies memory exhaustion", () => {
    expect(describeImageError(new Error("Array buffer allocation failed"))).toMatch(/memory/);
  });

  it("identifies a decode failure", () => {
    expect(describeImageError(new Error("The source image cannot be decoded"))).toMatch(
      /couldn't be decoded/
    );
  });

  it("identifies an encode failure", () => {
    expect(describeImageError(new Error("Failed to encode blob"))).toMatch(/JPG or PNG/);
  });

  it("falls back for anything unrecognised", () => {
    expect(describeImageError(new Error("weird"), "Could not resize.")).toBe("Could not resize.");
  });

  it("handles a non-Error value without throwing", () => {
    expect(describeImageError(undefined, "fallback")).toBe("fallback");
  });
});
