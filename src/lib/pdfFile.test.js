import { describe, it, expect } from "vitest";
import {
  hasPdfSignature,
  checkPdfMetadata,
  validatePdfFile,
  validatePdfFiles,
  describeRejections,
  describePdfError,
  MAX_PDF_BYTES,
  LARGE_PDF_BYTES,
} from "./pdfFile";

// Minimal stand-in for the browser File API. vitest runs in node
// (see vitest.config.js), so File/Blob.slice aren't available.
function fakeFile({ name = "doc.pdf", type = "application/pdf", bytes = null, size = null } = {}) {
  const content = bytes || new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
  return {
    name,
    type,
    size: size === null ? content.length : size,
    slice: () => ({ arrayBuffer: async () => content.buffer }),
    arrayBuffer: async () => content.buffer,
  };
}

const pdfBytes = (extra = []) =>
  new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, ...extra]);

describe("hasPdfSignature", () => {
  it("accepts bytes starting with %PDF-", () => {
    expect(hasPdfSignature(pdfBytes())).toBe(true);
  });

  // Real generators emit files with junk before the header, and Acrobat
  // opens them, so refusing would reject files that work everywhere else.
  it("finds the header when it is preceded by leading junk", () => {
    const withJunk = new Uint8Array([0x0a, 0x0d, 0x20, ...pdfBytes()]);
    expect(hasPdfSignature(withJunk)).toBe(true);
  });

  it("rejects a PNG header", () => {
    expect(hasPdfSignature(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toBe(false);
  });

  it("rejects a zip header (a renamed .docx or .zip)", () => {
    expect(hasPdfSignature(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe(false);
  });

  it("rejects empty and undersized input without throwing", () => {
    expect(hasPdfSignature(new Uint8Array([]))).toBe(false);
    expect(hasPdfSignature(new Uint8Array([0x25, 0x50]))).toBe(false);
    expect(hasPdfSignature(null)).toBe(false);
  });

  // The scan window is bounded so a large file isn't searched end to end
  // looking for a header that a valid PDF would have put at the front.
  it("does not scan beyond the first 1024 bytes", () => {
    const late = new Uint8Array(2048);
    late.set(pdfBytes(), 1500);
    expect(hasPdfSignature(late)).toBe(false);
  });
});

describe("checkPdfMetadata", () => {
  it("accepts a normal PDF", () => {
    expect(checkPdfMetadata(fakeFile()).ok).toBe(true);
  });

  // The central fix: Windows without a PDF handler and most Android file
  // providers report an empty type for a valid PDF. The old
  // `type === "application/pdf"` check refused all of them.
  it("accepts a file with an empty mime type", () => {
    expect(checkPdfMetadata(fakeFile({ type: "" })).ok).toBe(true);
  });

  it("accepts the generic binary fallback type", () => {
    expect(checkPdfMetadata(fakeFile({ type: "application/octet-stream" })).ok).toBe(true);
  });

  it("rejects a positively-wrong mime type without reading bytes", () => {
    const result = checkPdfMetadata(fakeFile({ type: "image/png" }));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/doesn't look like a PDF/);
  });

  it("rejects a zero-byte file", () => {
    const result = checkPdfMetadata(fakeFile({ size: 0 }));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/empty/);
  });

  it("rejects a file past the in-browser size limit", () => {
    const result = checkPdfMetadata(fakeFile({ size: MAX_PDF_BYTES + 1 }));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/larger than the 100 MB limit/);
  });

  it("accepts a file exactly at the limit", () => {
    expect(checkPdfMetadata(fakeFile({ size: MAX_PDF_BYTES })).ok).toBe(true);
  });

  it("rejects a missing file", () => {
    expect(checkPdfMetadata(null).ok).toBe(false);
  });
});

describe("validatePdfFile", () => {
  it("accepts a real PDF", async () => {
    const result = await validatePdfFile(fakeFile());
    expect(result.ok).toBe(true);
    expect(result.isLarge).toBe(false);
  });

  // The other half of the type fix: a file *claiming* to be a PDF but
  // carrying no PDF bytes used to be accepted, then blew up inside pdf-lib
  // with an unreadable parse error.
  it("rejects a non-PDF that claims application/pdf", async () => {
    const result = await validatePdfFile(
      fakeFile({ bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04]) })
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/isn't a valid PDF/);
  });

  it("accepts a valid PDF whose type is blank", async () => {
    expect((await validatePdfFile(fakeFile({ type: "" }))).ok).toBe(true);
  });

  it("flags a large-but-allowed file so the UI can warn", async () => {
    const result = await validatePdfFile(fakeFile({ size: LARGE_PDF_BYTES + 1 }));
    expect(result.ok).toBe(true);
    expect(result.isLarge).toBe(true);
  });

  it("reports a read failure separately from a malformed PDF", async () => {
    const unreadable = {
      name: "gone.pdf",
      type: "application/pdf",
      size: 100,
      slice: () => ({
        arrayBuffer: async () => {
          throw new Error("NotFoundError");
        },
      }),
    };
    const result = await validatePdfFile(unreadable);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/moved or deleted/);
  });
});

describe("validatePdfFiles", () => {
  // Merge takes a batch. Rejecting the whole drop over one bad file forced
  // the user to work out which one it was and start again.
  it("keeps the valid files and reports the rest", async () => {
    const good = fakeFile({ name: "a.pdf" });
    const bad = fakeFile({ name: "b.png", type: "image/png" });

    const { accepted, rejected } = await validatePdfFiles([good, bad]);
    expect(accepted).toHaveLength(1);
    expect(accepted[0].name).toBe("a.pdf");
    expect(rejected).toHaveLength(1);
    expect(rejected[0].name).toBe("b.png");
  });

  it("preserves the order files were given in", async () => {
    const files = [fakeFile({ name: "1.pdf" }), fakeFile({ name: "2.pdf" })];
    const { accepted } = await validatePdfFiles(files);
    expect(accepted.map((f) => f.name)).toEqual(["1.pdf", "2.pdf"]);
  });

  it("handles an empty selection", async () => {
    const { accepted, rejected } = await validatePdfFiles([]);
    expect(accepted).toEqual([]);
    expect(rejected).toEqual([]);
  });
});

describe("describeRejections", () => {
  it("returns nothing when everything was accepted", () => {
    expect(describeRejections([])).toBe("");
  });

  it("quotes the reason for a single rejection", () => {
    const text = describeRejections([{ name: "a.png", error: "Not a PDF." }]);
    expect(text).toContain("a.png");
    expect(text).toContain("Not a PDF.");
  });

  it("summarises several rejections by name", () => {
    const text = describeRejections([
      { name: "a.png", error: "x" },
      { name: "b.zip", error: "y" },
    ]);
    expect(text).toMatch(/Skipped 2 files/);
    expect(text).toContain("a.png");
    expect(text).toContain("b.zip");
  });
});

describe("describePdfError", () => {
  // The old code showed one generic string for every failure, so a
  // password-protected file and an out-of-memory crash — which need
  // completely different responses — read identically.
  it("identifies an encrypted document", () => {
    expect(describePdfError(new Error("Input document to `PDFDocument.load` is encrypted"))).toMatch(
      /password-protected/
    );
  });

  it("identifies a password prompt", () => {
    expect(describePdfError(new Error("No password given"))).toMatch(/password-protected/);
  });

  it("identifies memory exhaustion", () => {
    expect(describePdfError(new Error("Array buffer allocation failed"))).toMatch(/memory/);
  });

  it("identifies a damaged file", () => {
    expect(describePdfError(new Error("Invalid PDF structure"))).toMatch(/damaged/);
    expect(describePdfError(new Error("bad XRef entry"))).toMatch(/damaged/);
  });

  it("falls back to the supplied message for anything unrecognised", () => {
    expect(describePdfError(new Error("something odd"), "Could not merge.")).toBe(
      "Could not merge."
    );
  });

  it("handles a non-Error value without throwing", () => {
    expect(describePdfError(undefined, "fallback")).toBe("fallback");
    expect(describePdfError("encrypted")).toMatch(/password-protected/);
  });
});
