import { describe, it, expect } from "vitest";
import {
  detectSpreadsheetFormat,
  checkSpreadsheetMetadata,
  validateSpreadsheetFile,
  describeSpreadsheetError,
  looksLikeCsv,
} from "./xlsxFile";
import { MAX_UPLOAD_BYTES } from "./excelToPdfLimits";

// Minimal stand-in for the browser File API. vitest runs in node
// (see vitest.config.js), so File/Blob.slice aren't available.
function fakeFile({ name = "book.xlsx", type = "", bytes = null, size = null } = {}) {
  const content = bytes || xlsxBytes();
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

const xlsxBytes = () => zipWith("[Content_Types].xml", "xl/workbook.xml");
const xlsbBytes = () => zipWith("[Content_Types].xml", "xl/workbook.bin");
const odsBytes = () => zipWith("mimetype", "application/vnd.oasis.opendocument.spreadsheet");
const docxBytes = () => zipWith("[Content_Types].xml", "word/document.xml");
const pptxBytes = () => zipWith("[Content_Types].xml", "ppt/presentation.xml");
const ole2Bytes = () =>
  new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00, 0x00]);
const csvBytes = (text = "name,qty,price\nwidget,2,4.50\n") => new Uint8Array(ascii(text));

describe("detectSpreadsheetFormat", () => {
  it("identifies a .xlsx by its xl/ entries", () => {
    expect(detectSpreadsheetFormat(xlsxBytes(), "book.xlsx")).toBe("xlsx");
  });

  it("identifies an .ods by its opendocument.spreadsheet mimetype entry", () => {
    expect(detectSpreadsheetFormat(odsBytes(), "book.ods")).toBe("ods");
  });

  it("treats a macro-enabled .xlsm as a .xlsx, since they are structurally identical", () => {
    // The macros live in a part the PDF export never runs, and headless
    // LibreOffice does not execute them on import. Refusing one would refuse a
    // file that converts perfectly.
    expect(detectSpreadsheetFormat(xlsxBytes(), "book.xlsm")).toBe("xlsx");
  });

  // The check that must run before the .xlsx one. A .xlsb carries the same
  // "xl/" entries, so ordering these the other way round accepts it as OOXML
  // and hands the user a PDF of blank sheets — the silent failure this module
  // exists to prevent.
  it("identifies a binary .xlsb ahead of the generic xl/ match", () => {
    expect(detectSpreadsheetFormat(xlsbBytes(), "book.xlsb")).toBe("xlsb");
  });

  it("identifies a .xlsb from its bytes even when the name claims .xlsx", () => {
    // The bytes decide for ZIP formats — the name is ignored, per the rule the
    // rest of the codebase follows.
    expect(detectSpreadsheetFormat(xlsbBytes(), "renamed.xlsx")).toBe("xlsb");
  });

  // The same OLE2 problem pptxFile.js documents: .doc, .ppt, and .xls share one
  // header, so the bytes cannot decide and the extension has to.
  it("identifies a legacy .xls from the OLE2 magic plus its extension", () => {
    expect(detectSpreadsheetFormat(ole2Bytes(), "old-book.xls")).toBe("xls");
  });

  it("refuses to guess for an OLE2 file with no identifying extension", () => {
    // Guessing "xls" for every legacy Office binary would feed .doc uploads to
    // the Calc filter and return nonsense instead of an honest error.
    expect(detectSpreadsheetFormat(ole2Bytes(), "mystery")).toBe("ole2");
    expect(detectSpreadsheetFormat(ole2Bytes(), "letter.doc")).toBe("ole2");
    expect(detectSpreadsheetFormat(ole2Bytes(), "deck.ppt")).toBe("ole2");
  });

  it("names a document and a presentation rather than lumping them in with junk", () => {
    expect(detectSpreadsheetFormat(docxBytes(), "letter.docx")).toBe("docx");
    expect(detectSpreadsheetFormat(pptxBytes(), "deck.pptx")).toBe("pptx");
  });

  it("reports an unidentified ZIP as such, leaving the decision to the caller", () => {
    expect(detectSpreadsheetFormat(zipWith("random/file.txt"), "thing.zip")).toBe("zip");
  });

  it("detects a CSV, the most common wrong file for this tool", () => {
    expect(detectSpreadsheetFormat(csvBytes(), "data.csv")).toBe("csv");
  });

  it("returns unknown for empty or missing input rather than throwing", () => {
    expect(detectSpreadsheetFormat(new Uint8Array(), "x.xlsx")).toBe("unknown");
    expect(detectSpreadsheetFormat(null, "x.xlsx")).toBe("unknown");
    expect(detectSpreadsheetFormat(undefined)).toBe("unknown");
  });

  it("finds the marker even when it sits well into the scan window", () => {
    // Google Sheets and openpyxl order their entries differently from Excel.
    const padded = new Uint8Array([...ZIP, ...new Array(2000).fill(0x41), ...ascii("xl/workbook.xml")]);
    expect(detectSpreadsheetFormat(padded, "book.xlsx")).toBe("xlsx");
  });
});

describe("looksLikeCsv", () => {
  it("accepts a comma-delimited first line", () => {
    expect(looksLikeCsv(csvBytes("a,b,c\n1,2,3\n"))).toBe(true);
  });

  it("accepts the semicolon and tab delimiters Excel writes in other locales", () => {
    expect(looksLikeCsv(csvBytes("a;b;c\n1;2;3\n"))).toBe(true);
    expect(looksLikeCsv(csvBytes("a\tb\tc\n1\t2\t3\n"))).toBe(true);
  });

  it("rejects binary content, so a real workbook never lands in the CSV branch", () => {
    // A NUL byte is the giveaway. Without this check a compressed ZIP whose
    // bytes happened to include a comma would be called a CSV.
    expect(looksLikeCsv(new Uint8Array([0x61, 0x2c, 0x00, 0x62]))).toBe(false);
    expect(looksLikeCsv(xlsxBytes())).toBe(false);
    expect(looksLikeCsv(ole2Bytes())).toBe(false);
  });

  it("rejects plain prose with no delimiter", () => {
    expect(looksLikeCsv(csvBytes("just a sentence with no delimiter\n"))).toBe(false);
  });

  it("rejects empty input", () => {
    expect(looksLikeCsv(new Uint8Array())).toBe(false);
    expect(looksLikeCsv(null)).toBe(false);
  });

  it("only considers the first line, not the whole file", () => {
    // A title row above the data is ordinary in exported reports; a delimiter
    // appearing only on line 5 is not what this heuristic is for.
    expect(looksLikeCsv(csvBytes("title with no delimiter\na,b,c\n"))).toBe(false);
  });
});

describe("checkSpreadsheetMetadata", () => {
  it("refuses a missing or empty file", () => {
    expect(checkSpreadsheetMetadata(null).ok).toBe(false);
    expect(checkSpreadsheetMetadata(fakeFile({ size: 0 })).ok).toBe(false);
  });

  it("refuses a file over the limit before any bytes are read", () => {
    const result = checkSpreadsheetMetadata(fakeFile({ size: MAX_UPLOAD_BYTES + 1 }));
    expect(result.ok).toBe(false);
    expect(result.error).toContain("20 MB");
  });

  it("names a PDF specifically, since this tool sits among PDF tools", () => {
    const result = checkSpreadsheetMetadata(fakeFile({ name: "report.pdf" }));
    expect(result.ok).toBe(false);
    expect(result.error.toLowerCase()).toContain("pdf");
  });

  it("names Apple Numbers and says how to convert it", () => {
    const result = checkSpreadsheetMetadata(fakeFile({ name: "budget.numbers" }));
    expect(result.ok).toBe(false);
    expect(result.error).toContain(".xlsx");
  });

  it("accepts a valid file whose MIME type is empty", () => {
    // The whole reason file.type is never the decision: a machine without
    // Office installed reports an empty string for a perfectly good .xlsx.
    expect(checkSpreadsheetMetadata(fakeFile({ type: "" })).ok).toBe(true);
  });
});

describe("validateSpreadsheetFile", () => {
  it("accepts a .xlsx", async () => {
    const result = await validateSpreadsheetFile(fakeFile());
    expect(result.ok).toBe(true);
    expect(result.format).toBe("xlsx");
  });

  it("accepts an .ods and a legacy .xls", async () => {
    expect((await validateSpreadsheetFile(fakeFile({ name: "b.ods", bytes: odsBytes() }))).ok).toBe(true);
    expect((await validateSpreadsheetFile(fakeFile({ name: "b.xls", bytes: ole2Bytes() }))).ok).toBe(true);
  });

  it("refuses a CSV with its own reason, not the generic one", async () => {
    const result = await validateSpreadsheetFile(fakeFile({ name: "data.csv", bytes: csvBytes() }));
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("csv");
    expect(result.error).toContain(".xlsx");
  });

  // The refusal that protects against a technically-successful, actually-empty
  // PDF — the same class of silent failure as HEIC and scanned PDFs elsewhere.
  it("refuses a .xlsb rather than returning blank sheets", async () => {
    const result = await validateSpreadsheetFile(fakeFile({ name: "b.xlsb", bytes: xlsbBytes() }));
    expect(result.ok).toBe(false);
    expect(result.error).toContain(".xlsx");
  });

  it("points a Word or PowerPoint file at the right tool", async () => {
    const word = await validateSpreadsheetFile(fakeFile({ name: "l.docx", bytes: docxBytes() }));
    expect(word.ok).toBe(false);
    expect(word.error).toContain("Word to PDF");

    const deck = await validateSpreadsheetFile(fakeFile({ name: "d.pptx", bytes: pptxBytes() }));
    expect(deck.ok).toBe(false);
    expect(deck.error).toContain("PowerPoint to PDF");
  });

  it("refuses an ambiguous OLE2 file and says how to disambiguate it", async () => {
    const result = await validateSpreadsheetFile(fakeFile({ name: "mystery", bytes: ole2Bytes() }));
    expect(result.ok).toBe(false);
    expect(result.error).toContain(".xls");
  });

  it("trusts a .xlsx extension over an unrecognised ZIP layout", async () => {
    // A false rejection blocks a file the converter would have handled; a false
    // acceptance costs one failed conversion with an accurate error. The
    // converter is the authority.
    const result = await validateSpreadsheetFile(
      fakeFile({ name: "odd.xlsx", bytes: zipWith("weird/ordering.xml") })
    );
    expect(result.ok).toBe(true);
  });

  it("refuses an unrecognised ZIP with no spreadsheet extension", async () => {
    const result = await validateSpreadsheetFile(
      fakeFile({ name: "archive.zip", bytes: zipWith("stuff/file.txt") })
    );
    expect(result.ok).toBe(false);
    expect(result.error.toLowerCase()).toContain("zip");
  });

  it("reports an unreadable handle as retryable rather than as a damaged file", async () => {
    const broken = {
      name: "book.xlsx",
      type: "",
      size: 1024,
      slice: () => ({
        arrayBuffer: async () => {
          throw new Error("NotReadableError");
        },
      }),
    };

    const result = await validateSpreadsheetFile(broken);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("moved or deleted");
  });

  it("flags a large file without refusing it", async () => {
    const result = await validateSpreadsheetFile(fakeFile({ size: 6 * 1024 * 1024 }));
    expect(result.ok).toBe(true);
    expect(result.isLarge).toBe(true);
  });
});

describe("describeSpreadsheetError", () => {
  it("tells a password-protected file apart from a broken one", () => {
    // The generic fallback is the failure to avoid: these two need completely
    // different responses and "conversion failed" addresses neither.
    expect(describeSpreadsheetError(new Error("file is encrypted"))).toContain("password");
    expect(describeSpreadsheetError(new Error("could not parse"))).toContain("damaged");
  });

  it("falls back for an unrecognised cause", () => {
    expect(describeSpreadsheetError(new Error("???"), "fallback copy")).toBe("fallback copy");
  });

  it("handles a non-Error throw without crashing", () => {
    expect(describeSpreadsheetError("encrypted")).toContain("password");
    expect(describeSpreadsheetError(null, "fallback")).toBe("fallback");
    expect(describeSpreadsheetError(undefined, "fallback")).toBe("fallback");
  });
});
