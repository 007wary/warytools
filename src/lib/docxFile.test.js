import { describe, it, expect } from "vitest";
import {
  detectDocumentFormat,
  checkDocumentMetadata,
  validateDocumentFile,
  describeDocumentError,
} from "./docxFile";
import { MAX_UPLOAD_BYTES } from "./wordToPdfLimits";

// Minimal stand-in for the browser File API. vitest runs in node
// (see vitest.config.js), so File/Blob.slice aren't available.
function fakeFile({ name = "doc.docx", type = "", bytes = null, size = null } = {}) {
  const content = bytes || docxBytes();
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

const docxBytes = () => zipWith("[Content_Types].xml", "word/document.xml");
const odtBytes = () => zipWith("mimetype", "application/vnd.oasis.opendocument.text");
const docBytes = () =>
  new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00, 0x00]);
// Spelled as explicit bytes for the leading signature rather than relying on
// escaping inside a JS string. Writing this fixture as ascii("{\\rtf...")
// produced { CR t f — the same mis-escape that was live in the API route and
// the converter service, and because the fixture and the code agreed on the
// wrong bytes, the test passed while every real .rtf was rejected.
const rtfBytes = () => new Uint8Array([0x7b, 0x5c, 0x72, 0x74, 0x66, ...ascii("1\\ansi test}")]);

describe("detectDocumentFormat", () => {
  it("identifies a .docx by its word/ entries", () => {
    expect(detectDocumentFormat(docxBytes())).toBe("docx");
  });

  it("identifies a legacy .doc by the OLE2 compound-file magic", () => {
    expect(detectDocumentFormat(docBytes())).toBe("doc");
  });

  it("identifies an .odt by its opendocument.text mimetype entry", () => {
    expect(detectDocumentFormat(odtBytes())).toBe("odt");
  });

  it("identifies an .rtf by its {\\rtf prefix", () => {
    expect(detectDocumentFormat(rtfBytes())).toBe("rtf");
  });

  // Pins the literal bytes a real RTF file starts with, independent of how any
  // fixture spells them. The signature is easy to get wrong in a JS string —
  // "{\\rtf" escapes to { CR t f — and that mistake shipped in both the API
  // route and the converter until a live smoke test caught it. A fixture built
  // with the same mistake agrees with broken code, so this asserts against
  // hand-written byte values instead.
  it("matches the real RTF signature, not a mis-escaped one", () => {
    // "{\rtf" as it appears on disk: 0x5c is a backslash, not a carriage return.
    const onDisk = new Uint8Array([0x7b, 0x5c, 0x72, 0x74, 0x66, 0x31]);
    expect(detectDocumentFormat(onDisk)).toBe("rtf");

    // { CR t f — what Buffer.from("{\\rtf") actually produces.
    const misEscaped = new Uint8Array([0x7b, 0x0d, 0x74, 0x66, 0x31]);
    expect(detectDocumentFormat(misEscaped)).toBe("unknown");
  });

  // The reason this module exists. All OOXML formats are ZIPs, so the magic
  // bytes alone say only "archive" — a spreadsheet would otherwise sail
  // through and fail deep inside the converter with a generic error.
  it("tells a spreadsheet and a presentation apart from a document", () => {
    expect(detectDocumentFormat(zipWith("xl/workbook.xml"))).toBe("xlsx");
    expect(detectDocumentFormat(zipWith("ppt/presentation.xml"))).toBe("pptx");
  });

  // A .docx containing an embedded chart carries an xl/ entry for the backing
  // workbook. Document markers are checked first so it is still a document.
  it("treats a document with an embedded workbook as a document", () => {
    expect(detectDocumentFormat(zipWith("word/document.xml", "xl/embeddings/chart.xlsx"))).toBe(
      "docx"
    );
  });

  it("reports an unidentifiable ZIP as zip, not as a document", () => {
    expect(detectDocumentFormat(zipWith("photos/holiday.jpg"))).toBe("zip");
  });

  it("rejects a PDF and other non-container bytes", () => {
    expect(detectDocumentFormat(new Uint8Array(ascii("%PDF-1.7")))).toBe("unknown");
    expect(detectDocumentFormat(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe("unknown");
  });

  it("handles empty and null input without throwing", () => {
    expect(detectDocumentFormat(new Uint8Array([]))).toBe("unknown");
    expect(detectDocumentFormat(null)).toBe("unknown");
  });
});

describe("checkDocumentMetadata", () => {
  it("accepts an ordinary document", () => {
    expect(checkDocumentMetadata(fakeFile()).ok).toBe(true);
  });

  it("rejects a missing or empty file", () => {
    expect(checkDocumentMetadata(null).ok).toBe(false);
    expect(checkDocumentMetadata(fakeFile({ size: 0 })).ok).toBe(false);
  });

  it("rejects a file over the upload ceiling", () => {
    const result = checkDocumentMetadata(fakeFile({ size: MAX_UPLOAD_BYTES + 1 }));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/20 MB/);
  });

  // This tool sits beside five tools that all want a PDF, so a PDF is the
  // most likely wrong file. It gets named, and points at the reverse tool.
  it("names a PDF specifically and points at the reverse tool", () => {
    const result = checkDocumentMetadata(fakeFile({ name: "contract.pdf" }));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/PDF to Word/);
  });

  it("gives Apple Pages files an actionable message", () => {
    const result = checkDocumentMetadata(fakeFile({ name: "essay.pages" }));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/export as Word/i);
  });

  it("is case-insensitive about the extension", () => {
    expect(checkDocumentMetadata(fakeFile({ name: "REPORT.PDF" })).ok).toBe(false);
  });
});

describe("validateDocumentFile", () => {
  it("accepts each convertible format", async () => {
    const cases = [
      ["a.docx", docxBytes(), "docx"],
      ["a.doc", docBytes(), "doc"],
      ["a.odt", odtBytes(), "odt"],
      ["a.rtf", rtfBytes(), "rtf"],
    ];

    for (const [name, bytes, format] of cases) {
      const result = await validateDocumentFile(fakeFile({ name, bytes }));
      expect(result.ok, name).toBe(true);
      expect(result.format).toBe(format);
    }
  });

  // The bytes decide, not the extension: a renamed spreadsheet is refused
  // even though its name says .docx.
  it("refuses a spreadsheet renamed to .docx", async () => {
    const result = await validateDocumentFile(
      fakeFile({ name: "budget.docx", bytes: zipWith("xl/workbook.xml") })
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Excel/);
  });

  // The scan window is a heuristic, and a false rejection blocks a file that
  // would have converted. An unidentified ZIP named .docx is handed to the
  // converter, which is the real authority.
  it("lets an unidentified ZIP through when the extension says .docx", async () => {
    const result = await validateDocumentFile(
      fakeFile({ name: "odd.docx", bytes: zipWith("unexpected/layout.xml") })
    );
    expect(result.ok).toBe(true);
  });

  it("refuses an unidentified ZIP that is not named like a document", async () => {
    const result = await validateDocumentFile(
      fakeFile({ name: "photos.zip", bytes: zipWith("photos/a.jpg") })
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/ZIP archive/);
  });

  it("flags a large-but-acceptable file for the slow warning", async () => {
    const result = await validateDocumentFile(fakeFile({ size: 6 * 1024 * 1024 }));
    expect(result.ok).toBe(true);
    expect(result.isLarge).toBe(true);
  });

  it("reports an unreadable handle as retryable rather than as a bad file", async () => {
    const broken = {
      name: "a.docx",
      type: "",
      size: 100,
      slice: () => ({
        arrayBuffer: async () => {
          throw new Error("NotReadableError");
        },
      }),
    };
    const result = await validateDocumentFile(broken);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/moved or deleted/);
  });
});

describe("describeDocumentError", () => {
  it("distinguishes a password-protected document", () => {
    expect(describeDocumentError(new Error("file is encrypted"))).toMatch(/password-protected/);
  });

  it("distinguishes a damaged document", () => {
    expect(describeDocumentError(new Error("failed to parse document"))).toMatch(/damaged/);
  });

  it("falls back for an unrecognised cause", () => {
    expect(describeDocumentError(new Error("socket hang up"), "fallback")).toBe("fallback");
  });

  it("handles a non-Error value without throwing", () => {
    expect(() => describeDocumentError(null)).not.toThrow();
    expect(() => describeDocumentError(undefined)).not.toThrow();
  });
});
