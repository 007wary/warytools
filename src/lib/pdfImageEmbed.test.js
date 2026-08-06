import { describe, it, expect } from "vitest";
import {
  isNativelyEmbeddable,
  transcodeTargetFor,
  planEmbed,
  describeTranscodes,
  outputPdfName,
} from "./pdfImageEmbed";

describe("isNativelyEmbeddable", () => {
  it("accepts exactly the two formats pdf-lib can embed", () => {
    expect(isNativelyEmbeddable("image/jpeg")).toBe(true);
    expect(isNativelyEmbeddable("image/png")).toBe(true);
  });

  it("rejects everything else, including formats browsers decode fine", () => {
    // The distinction that matters: the browser can decode all of these, so
    // they're valid inputs — they just can't go into a PDF unchanged.
    for (const type of ["image/webp", "image/avif", "image/gif", "image/bmp"]) {
      expect(isNativelyEmbeddable(type), type).toBe(false);
    }
  });
});

describe("transcodeTargetFor", () => {
  it("routes alpha-capable formats to PNG", () => {
    // Sending these to JPG would flatten transparency onto a matte, which is
    // unrecoverable and looks like corruption on any non-white background.
    for (const type of ["image/webp", "image/avif", "image/gif"]) {
      expect(transcodeTargetFor(type), type).toBe("image/png");
    }
  });

  it("routes BMP to JPG", () => {
    // BMP effectively never carries usable alpha, and re-encoding a large one
    // losslessly produces an enormous PDF for no benefit.
    expect(transcodeTargetFor("image/bmp")).toBe("image/jpeg");
  });

  it("defaults an unknown format to PNG", () => {
    // Paying bytes is recoverable; discarding an alpha channel is not.
    expect(transcodeTargetFor("image/unknown")).toBe("image/png");
    expect(transcodeTargetFor(undefined)).toBe("image/png");
  });
});

describe("planEmbed", () => {
  it("passes JPEG and PNG straight through with no transcode", () => {
    expect(planEmbed("image/jpeg")).toEqual({ embedAs: "jpg", transcodeTo: null });
    expect(planEmbed("image/png")).toEqual({ embedAs: "png", transcodeTo: null });
  });

  it("plans a PNG transcode for WebP", () => {
    expect(planEmbed("image/webp")).toEqual({ embedAs: "png", transcodeTo: "image/png" });
  });

  it("plans a JPG transcode for BMP", () => {
    expect(planEmbed("image/bmp")).toEqual({ embedAs: "jpg", transcodeTo: "image/jpeg" });
  });

  it("always names an embedder pdf-lib actually has", () => {
    const types = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif", "image/bmp"];
    for (const type of types) {
      expect(["jpg", "png"], type).toContain(planEmbed(type).embedAs);
    }
  });
});

describe("describeTranscodes", () => {
  it("says nothing when nothing was transcoded", () => {
    expect(describeTranscodes([])).toBe("");
    expect(describeTranscodes(null)).toBe("");
  });

  it("describes a single transcode in the singular", () => {
    const message = describeTranscodes([{ name: "a.webp", type: "image/webp" }]);
    expect(message).toContain("one WebP image was re-encoded");
  });

  it("groups by format rather than listing every filename", () => {
    // A batch of thirty WebPs should say "WebP", not name thirty files.
    const message = describeTranscodes(
      Array.from({ length: 30 }, (_, i) => ({ name: `photo-${i}.webp`, type: "image/webp" }))
    );

    expect(message).toContain("30 WebP images were re-encoded");
    expect(message).not.toContain("photo-0.webp");
  });

  it("lists multiple formats readably", () => {
    const message = describeTranscodes([
      { name: "a.webp", type: "image/webp" },
      { name: "b.avif", type: "image/avif" },
      { name: "c.gif", type: "image/gif" },
    ]);

    expect(message).toContain("WebP, AVIF and GIF");
  });

  it("explains why, not just what", () => {
    // The user chose AVIF for the file size and is about to wonder why the PDF
    // is large; the reason is the useful half of this message.
    const message = describeTranscodes([{ name: "a.avif", type: "image/avif" }]);
    expect(message).toContain("PDF can only store JPG and PNG");
  });
});

describe("outputPdfName", () => {
  it("keeps a single image's stem", () => {
    expect(outputPdfName([{ name: "receipt.jpg" }])).toBe("receipt.pdf");
    expect(outputPdfName([{ name: "scan.2024.png" }])).toBe("scan.2024.pdf");
  });

  it("uses a generic name for a batch", () => {
    expect(outputPdfName([{ name: "a.jpg" }, { name: "b.jpg" }])).toBe("images.pdf");
  });

  it("handles a missing or extensionless name", () => {
    expect(outputPdfName([{ name: "" }])).toBe("image.pdf");
    expect(outputPdfName([{ name: "noextension" }])).toBe("noextension.pdf");
    expect(outputPdfName([])).toBe("images.pdf");
    expect(outputPdfName(null)).toBe("images.pdf");
  });
});
