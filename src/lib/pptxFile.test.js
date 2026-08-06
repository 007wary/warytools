import { describe, it, expect } from "vitest";
import {
  detectPresentationFormat,
  checkPresentationMetadata,
  validatePresentationFile,
  describePresentationError,
} from "./pptxFile";
import { MAX_UPLOAD_BYTES } from "./powerPointToPdfLimits";

// Minimal stand-in for the browser File API. vitest runs in node
// (see vitest.config.js), so File/Blob.slice aren't available.
function fakeFile({ name = "deck.pptx", type = "", bytes = null, size = null } = {}) {
  const content = bytes || pptxBytes();
  return {
    name,
    type,
    size: size === null ? content.length : size,
    slice: () => ({ arrayBuffer: async () => content.buffer }),
    arrayBuffer: async () => content.buffer,
  };
}

const ascii = (text) => Array.from(text, (c) => c.charCodeAt(0));

const ZIP = [0x50, 0x4b, 0x03, 0x04];

/** A ZIP whose header region names the given entry paths. */
function zipWith(...entries) {
  return new Uint8Array([...ZIP, ...entries.flatMap((e) => [...ascii(e), 0x00])]);
}

const pptxBytes = () => zipWith("[Content_Types].xml", "ppt/presentation.xml");
const odpBytes = () => zipWith("mimetype", "application/vnd.oasis.opendocument.presentation");
const docxBytes = () => zipWith("[Content_Types].xml", "word/document.xml");
const xlsxBytes = () => zipWith("[Content_Types].xml", "xl/workbook.xml");
const ole2Bytes = () =>
  new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00, 0x00]);

describe("detectPresentationFormat", () => {
  it("identifies a .pptx by its ppt/ entries", () => {
    expect(detectPresentationFormat(pptxBytes(), "deck.pptx")).toBe("pptx");
  });

  it("identifies an .odp by its opendocument.presentation mimetype entry", () => {
    expect(detectPresentationFormat(odpBytes(), "deck.odp")).toBe("odp");
  });

  it("treats a .ppsx slideshow as a .pptx, since they are structurally identical", () => {
    // A slideshow save differs only in its content-type declaration and in how
    // PowerPoint opens it. Refusing one would refuse a file that converts fine.
    expect(detectPresentationFormat(pptxBytes(), "deck.ppsx")).toBe("pptx");
  });

  // The core difference from docxFile.js, and the reason this module exists
  // separately. A .doc, .ppt, and .xls share one header, so the bytes cannot
  // decide and the extension has to.
  it("identifies a legacy .ppt from the OLE2 magic plus its extension", () => {
    expect(detectPresentationFormat(ole2Bytes(), "old-deck.ppt")).toBe("ppt");
  });

  it("accepts a legacy .pps slideshow the same way", () => {
    // Reported as "ppt" deliberately — the tag names the import filter, and a
    // .pps is a .ppt that opens in slideshow mode.
    expect(detectPresentationFormat(ole2Bytes(), "old-deck.pps")).toBe("ppt");
  });

  it("refuses to guess which application wrote an unlabelled OLE2 file", () => {
    // Returning "ppt" here would send a .doc or .xls to the Impress filter.
    expect(detectPresentationFormat(ole2Bytes(), "mystery")).toBe("ole2");
    expect(detectPresentationFormat(ole2Bytes(), "report.doc")).toBe("ole2");
    expect(detectPresentationFormat(ole2Bytes(), "budget.xls")).toBe("ole2");
  });

  it("is case-insensitive about the legacy extension", () => {
    expect(detectPresentationFormat(ole2Bytes(), "DECK.PPT")).toBe("ppt");
  });

  it("tells a Word document and a spreadsheet apart from a deck", () => {
    expect(detectPresentationFormat(docxBytes(), "report.docx")).toBe("docx");
    expect(detectPresentationFormat(xlsxBytes(), "budget.xlsx")).toBe("xlsx");
  });

  it("still identifies a deck that embeds a chart workbook", () => {
    // A chart pasted into a slide carries an xl/ entry alongside the ppt/ ones.
    // Checking accepted formats first is what keeps this a presentation.
    const withChart = zipWith("[Content_Types].xml", "ppt/slides/slide1.xml", "xl/workbook.xml");
    expect(detectPresentationFormat(withChart, "deck.pptx")).toBe("pptx");
  });

  it("reports an unidentified ZIP as zip rather than guessing", () => {
    expect(detectPresentationFormat(zipWith("random/thing.txt"), "a.zip")).toBe("zip");
  });

  it("returns unknown for empty or non-container bytes", () => {
    expect(detectPresentationFormat(new Uint8Array([]), "x")).toBe("unknown");
    expect(detectPresentationFormat(new Uint8Array(ascii("hello world")), "x.txt")).toBe("unknown");
    expect(detectPresentationFormat(null, "x")).toBe("unknown");
  });

  it("does not require a filename for ZIP-based formats", () => {
    // The bytes decide everywhere except OLE2; the name is ignored here.
    expect(detectPresentationFormat(pptxBytes())).toBe("pptx");
  });
});

describe("checkPresentationMetadata", () => {
  it("accepts an ordinary presentation", () => {
    expect(checkPresentationMetadata(fakeFile()).ok).toBe(true);
  });

  it("rejects a missing or empty file", () => {
    expect(checkPresentationMetadata(null).ok).toBe(false);
    expect(checkPresentationMetadata(fakeFile({ size: 0 })).ok).toBe(false);
  });

  it("rejects a file over the upload limit", () => {
    const result = checkPresentationMetadata(fakeFile({ size: MAX_UPLOAD_BYTES + 1 }));
    expect(result.ok).toBe(false);
    // Points at the actual cause of an oversized deck rather than at splitting.
    expect(result.error).toMatch(/Compress Pictures/i);
  });

  it("names a PDF specifically instead of refusing it generically", () => {
    const result = checkPresentationMetadata(fakeFile({ name: "report.pdf" }));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/PDF/);
  });

  it("tells a Keynote user how to proceed", () => {
    const result = checkPresentationMetadata(fakeFile({ name: "pitch.key" }));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Keynote/i);
    expect(result.error).toMatch(/\.pptx/);
  });
});

describe("validatePresentationFile", () => {
  it("accepts a .pptx", async () => {
    const result = await validatePresentationFile(fakeFile());
    expect(result.ok).toBe(true);
    expect(result.format).toBe("pptx");
  });

  it("accepts a legacy .ppt", async () => {
    const result = await validatePresentationFile(
      fakeFile({ name: "old.ppt", bytes: ole2Bytes() })
    );
    expect(result.ok).toBe(true);
    expect(result.format).toBe("ppt");
  });

  it("accepts an .odp", async () => {
    const result = await validatePresentationFile(
      fakeFile({ name: "deck.odp", bytes: odpBytes() })
    );
    expect(result.ok).toBe(true);
    expect(result.format).toBe("odp");
  });

  it("points a Word document at the tool that handles it", async () => {
    const result = await validatePresentationFile(
      fakeFile({ name: "report.docx", bytes: docxBytes() })
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Word to PDF/);
  });

  it("names a spreadsheet rather than failing generically", async () => {
    const result = await validatePresentationFile(
      fakeFile({ name: "budget.xlsx", bytes: xlsxBytes() })
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Excel/i);
  });

  it("explains the ambiguity of an unlabelled legacy Office file", async () => {
    const result = await validatePresentationFile(
      fakeFile({ name: "mystery", bytes: ole2Bytes() })
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/\.ppt/);
  });

  // The heuristic's escape hatch: a false rejection blocks a file that would
  // have converted, while a false acceptance costs one failed conversion.
  it("trusts a .pptx extension when the ZIP scan window found nothing", async () => {
    const result = await validatePresentationFile(
      fakeFile({ name: "unusual.pptx", bytes: zipWith("some/other/entry.xml") })
    );
    expect(result.ok).toBe(true);
  });

  it("rejects an unidentified ZIP with no presentation extension", async () => {
    const result = await validatePresentationFile(
      fakeFile({ name: "archive.zip", bytes: zipWith("some/other/entry.xml") })
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/ZIP/i);
  });

  it("flags a large file so the client can warn about conversion time", async () => {
    const big = await validatePresentationFile(fakeFile({ size: 4 * 1024 * 1024 }));
    expect(big.ok).toBe(true);
    expect(big.isLarge).toBe(true);

    const small = await validatePresentationFile(fakeFile({ size: 1024 }));
    expect(small.isLarge).toBe(false);
  });

  it("reports an unreadable handle distinctly from a bad format", async () => {
    const broken = {
      name: "deck.pptx",
      size: 2048,
      slice: () => ({
        arrayBuffer: async () => {
          throw new Error("NotReadableError");
        },
      }),
    };

    const result = await validatePresentationFile(broken);
    expect(result.ok).toBe(false);
    // Retrying genuinely fixes this one, unlike a malformed file.
    expect(result.error).toMatch(/moved or deleted/i);
  });
});

describe("describePresentationError", () => {
  it("gives password-protected files their own instruction", () => {
    expect(describePresentationError(new Error("file is encrypted"))).toMatch(/password/i);
    expect(describePresentationError(new Error("password required"))).toMatch(/password/i);
  });

  it("gives damaged files their own instruction", () => {
    expect(describePresentationError(new Error("failed to parse"))).toMatch(/damaged/i);
    expect(describePresentationError(new Error("invalid structure"))).toMatch(/damaged/i);
  });

  it("falls back rather than inventing a cause", () => {
    expect(describePresentationError(new Error("something odd"), "fallback")).toBe("fallback");
    expect(describePresentationError(null, "fallback")).toBe("fallback");
  });
});
