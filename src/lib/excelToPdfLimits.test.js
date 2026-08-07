import { describe, it, expect } from "vitest";
import {
  MAX_UPLOAD_BYTES,
  SLOW_UPLOAD_BYTES,
  CONVERSION_TIMEOUT_MS,
  CLIENT_TIMEOUT_MS,
  ACCEPTED_EXTENSIONS,
  ACCEPT_ATTRIBUTE,
  SCALING_MODES,
  ORIENTATIONS,
  SHEET_SELECTIONS,
  DEFAULT_SCALING,
  DEFAULT_ORIENTATION,
  DEFAULT_SHEET_SELECTION,
  normalizeOptions,
  encodeOptions,
  decodeOptions,
  describeOptions,
  checkUploadSize,
  rejectionMessage,
  pdfFilename,
} from "./excelToPdfLimits";

describe("upload limits", () => {
  it("matches the other three converters at 20 MB", () => {
    // Deliberately identical. Someone who has met the limit on one converter
    // should not have to learn a different number here.
    expect(MAX_UPLOAD_BYTES).toBe(20 * 1024 * 1024);
  });

  it("warns before it refuses", () => {
    expect(SLOW_UPLOAD_BYTES).toBeLessThan(MAX_UPLOAD_BYTES);
  });

  // The timeout chain is the part that breaks silently if someone tunes one
  // number in isolation: a client that gives up first reports a timeout for a
  // conversion that was about to succeed, and a route that gives up first
  // leaves a container burning CPU for nobody.
  it("keeps the client timeout above the conversion timeout", () => {
    expect(CLIENT_TIMEOUT_MS).toBeGreaterThan(CONVERSION_TIMEOUT_MS);
  });
});

describe("checkUploadSize", () => {
  it("refuses an empty file", () => {
    expect(checkUploadSize(0)).toEqual({ ok: false, reason: "empty" });
  });

  it("refuses a non-numeric size rather than treating it as zero", () => {
    expect(checkUploadSize(NaN).ok).toBe(false);
    expect(checkUploadSize(undefined).ok).toBe(false);
  });

  it("refuses anything over the ceiling", () => {
    expect(checkUploadSize(MAX_UPLOAD_BYTES + 1)).toEqual({ ok: false, reason: "too_large" });
  });

  it("accepts a file exactly at the ceiling", () => {
    expect(checkUploadSize(MAX_UPLOAD_BYTES).ok).toBe(true);
  });

  it("flags a slow file without refusing it", () => {
    expect(checkUploadSize(SLOW_UPLOAD_BYTES + 1)).toEqual({ ok: true, isSlow: true });
    expect(checkUploadSize(1024)).toEqual({ ok: true, isSlow: false });
  });
});

describe("accepted formats", () => {
  it("accepts the formats LibreOffice Calc reads natively", () => {
    expect(ACCEPTED_EXTENSIONS).toContain(".xlsx");
    expect(ACCEPTED_EXTENSIONS).toContain(".xls");
    expect(ACCEPTED_EXTENSIONS).toContain(".xlsm");
    expect(ACCEPTED_EXTENSIONS).toContain(".ods");
  });

  // Both are deliberate refusals with their own reasoning, not oversights. A
  // regression here would look like a feature ("we now accept CSV!") while
  // producing PDFs that are invented rather than converted.
  it("does not accept .csv, which has no layout to convert", () => {
    expect(ACCEPTED_EXTENSIONS).not.toContain(".csv");
  });

  it("does not accept .xlsb, which LibreOffice renders incompletely", () => {
    expect(ACCEPTED_EXTENSIONS).not.toContain(".xlsb");
  });

  it("lists extensions in the accept attribute, not just MIME types", () => {
    // The extensions are what make the picker behave on platforms whose MIME
    // registry is empty — the same reason pdfFile.js does not trust file.type.
    for (const extension of ACCEPTED_EXTENSIONS) {
      expect(ACCEPT_ATTRIBUTE).toContain(extension);
    }
  });
});

describe("normalizeOptions", () => {
  it("fills in every default when given nothing", () => {
    expect(normalizeOptions()).toEqual({
      scaling: DEFAULT_SCALING,
      orientation: DEFAULT_ORIENTATION,
      sheets: DEFAULT_SHEET_SELECTION,
    });
  });

  // The whole point of this tool's options. Calc's own default slices a wide
  // sheet into column strips; ours does not. If this assertion ever flips, the
  // tool has silently become the thing it was built to avoid.
  it("defaults to fitting the width, not to Calc's column-strip default", () => {
    expect(DEFAULT_SCALING).toBe("fit-width");
  });

  it("defaults orientation to auto rather than portrait", () => {
    // Spreadsheets are predominantly wide. Forcing portrait is the other half
    // of the orphaned-columns problem.
    expect(DEFAULT_ORIENTATION).toBe("auto");
  });

  it("defaults to converting every sheet", () => {
    // A default that adds pages is recoverable by the reader; one that drops
    // them silently is not.
    expect(DEFAULT_SHEET_SELECTION).toBe("all");
  });

  it("keeps valid values untouched", () => {
    expect(normalizeOptions({ scaling: "fit-page", orientation: "portrait", sheets: "first" })).toEqual({
      scaling: "fit-page",
      orientation: "portrait",
      sheets: "first",
    });
  });

  it("accepts every documented value for every option", () => {
    for (const scaling of SCALING_MODES) {
      expect(normalizeOptions({ scaling }).scaling).toBe(scaling);
    }
    for (const orientation of ORIENTATIONS) {
      expect(normalizeOptions({ orientation }).orientation).toBe(orientation);
    }
    for (const sheets of SHEET_SELECTIONS) {
      expect(normalizeOptions({ sheets }).sheets).toBe(sheets);
    }
  });

  it("falls back to defaults rather than failing on junk", () => {
    // Deliberate: these arrive on an untrusted header, and refusing a good
    // workbook over a malformed setting the user never typed would be the
    // wrong trade. Nothing here can make a conversion unsafe.
    const result = normalizeOptions({
      scaling: "; drop table",
      orientation: 42,
      sheets: { nested: true },
    });

    expect(result).toEqual({
      scaling: DEFAULT_SCALING,
      orientation: DEFAULT_ORIENTATION,
      sheets: DEFAULT_SHEET_SELECTION,
    });
  });

  it("is case- and whitespace-insensitive", () => {
    expect(normalizeOptions({ scaling: "  FIT-PAGE  " }).scaling).toBe("fit-page");
  });

  it("normalizes null and undefined without throwing", () => {
    expect(normalizeOptions({ scaling: null, orientation: undefined }).scaling).toBe(DEFAULT_SCALING);
  });
});

// These are the tests that matter most in this file. An option that survives
// the client but is dropped in transit converts with the wrong pagination and
// looks exactly like a converter bug — and per the coordinate-conversion lesson
// in CLAUDE.md, the assertion has to be the round trip rather than a recompute
// of the encoding.
describe("encodeOptions / decodeOptions round trip", () => {
  it("round-trips every combination of every option", () => {
    for (const scaling of SCALING_MODES) {
      for (const orientation of ORIENTATIONS) {
        for (const sheets of SHEET_SELECTIONS) {
          const original = { scaling, orientation, sheets };
          expect(decodeOptions(encodeOptions(original))).toEqual(original);
        }
      }
    }
  });

  it("produces a header value with no newlines, which would split the request", () => {
    for (const scaling of SCALING_MODES) {
      const header = encodeOptions({ scaling, orientation: "landscape", sheets: "first" });
      expect(header).not.toMatch(/[\r\n]/);
    }
  });

  it("only ever emits the three known keys, whatever it is handed", () => {
    const header = encodeOptions({ scaling: "fit-width", injected: "x\r\nX-Evil: 1" });
    expect(header).toBe("scaling=fit-width;orientation=auto;sheets=all");
    expect(header).not.toContain("injected");
  });

  it("decodes a missing header to the defaults", () => {
    expect(decodeOptions(undefined)).toEqual(normalizeOptions());
    expect(decodeOptions("")).toEqual(normalizeOptions());
  });

  it("decodes junk to the defaults rather than throwing", () => {
    expect(decodeOptions("garbage;;;===")).toEqual(normalizeOptions());
  });

  it("fills in the missing half of a partial header", () => {
    expect(decodeOptions("scaling=fit-page")).toEqual({
      scaling: "fit-page",
      orientation: DEFAULT_ORIENTATION,
      sheets: DEFAULT_SHEET_SELECTION,
    });
  });

  it("ignores unknown keys mixed in with valid ones", () => {
    expect(decodeOptions("scaling=fit-page;bogus=1;sheets=first")).toEqual({
      scaling: "fit-page",
      orientation: DEFAULT_ORIENTATION,
      sheets: "first",
    });
  });

  it("rejects an out-of-list value inside an otherwise valid header", () => {
    expect(decodeOptions("scaling=fit-everything;orientation=diagonal").scaling).toBe(DEFAULT_SCALING);
  });
});

describe("describeOptions", () => {
  it("describes every valid combination without leaving a gap", () => {
    // A missing branch would render "undefined" into the UI under the controls.
    for (const scaling of SCALING_MODES) {
      for (const orientation of ORIENTATIONS) {
        for (const sheets of SHEET_SELECTIONS) {
          const text = describeOptions({ scaling, orientation, sheets });
          expect(text).toBeTruthy();
          expect(text).not.toContain("undefined");
        }
      }
    }
  });

  it("says long sheets still span pages when fitting the width", () => {
    // The expectation gap this copy exists to close: "fit width" does not mean
    // "one page", and someone finding that out from the PDF assumes a bug.
    expect(describeOptions({ scaling: "fit-width" }).toLowerCase()).toContain("multiple pages");
  });

  it("warns that fitting a whole sheet to one page can hurt readability", () => {
    expect(describeOptions({ scaling: "fit-page" }).toLowerCase()).toContain("readable");
  });

  it("describes junk options as the defaults, matching what will actually run", () => {
    expect(describeOptions({ scaling: "nonsense" })).toBe(describeOptions(normalizeOptions()));
  });
});

describe("rejectionMessage", () => {
  it("has copy for every reason the route and client can produce", () => {
    const reasons = [
      "empty",
      "too_large",
      "not_a_spreadsheet",
      "csv",
      "unreadable",
      "encrypted",
      "no_content",
      "unavailable",
      "timeout",
      "rate_limited",
    ];

    for (const reason of reasons) {
      const message = rejectionMessage(reason);
      expect(message).toBeTruthy();
      expect(message).not.toBe(rejectionMessage("__unknown__"));
    }
  });

  it("falls back to something actionable for an unrecognised reason", () => {
    expect(rejectionMessage("weird")).toBeTruthy();
  });

  it("names the limit in the too-large message", () => {
    expect(rejectionMessage("too_large")).toContain("20 MB");
  });

  it("advises on sheets and print areas, not image compression", () => {
    // The PowerPoint tool's "Compress Pictures" advice would be useless here: a
    // workbook is over the limit because of its rows, not its pictures.
    const message = rejectionMessage("too_large").toLowerCase();
    expect(message).toContain("print area");
    expect(message).not.toContain("compress pictures");
  });

  it("tells a CSV user what to actually do", () => {
    const message = rejectionMessage("csv").toLowerCase();
    expect(message).toContain("csv");
    expect(message).toContain(".xlsx");
  });
});

describe("pdfFilename", () => {
  it("swaps the extension rather than appending to it", () => {
    expect(pdfFilename("Budget.xlsx")).toBe("Budget.pdf");
  });

  it("is case-insensitive about the source extension", () => {
    expect(pdfFilename("Budget.XLSX")).toBe("Budget.pdf");
  });

  it("handles every accepted extension", () => {
    expect(pdfFilename("a.xls")).toBe("a.pdf");
    expect(pdfFilename("a.xlsm")).toBe("a.pdf");
    expect(pdfFilename("a.ods")).toBe("a.pdf");
  });

  it("leaves a dot inside the name alone", () => {
    expect(pdfFilename("2024.Q1.budget.xlsx")).toBe("2024.Q1.budget.pdf");
  });

  it("falls back for a nameless file", () => {
    expect(pdfFilename("")).toBe("converted.pdf");
    expect(pdfFilename(null)).toBe("converted.pdf");
    expect(pdfFilename(".xlsx")).toBe("converted.pdf");
  });
});
