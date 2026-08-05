import { describe, it, expect } from "vitest";
import { validatePageRange, parsePageSelection, formatPageSelection } from "./pdfPageRange";

describe("validatePageRange", () => {
  it("accepts a valid range", () => {
    expect(validatePageRange("2", "7", 10)).toEqual({ ok: true, from: 2, to: 7 });
  });

  it("accepts a single-page range", () => {
    expect(validatePageRange("3", "3", 10)).toEqual({ ok: true, from: 3, to: 3 });
  });

  it("accepts the full document", () => {
    expect(validatePageRange("1", "10", 10)).toEqual({ ok: true, from: 1, to: 10 });
  });

  // The original bug: Number("") is 0, which the old code clamped to 1.
  // A cleared "to page" with from=5 produced from=5/to=1 and a misleading
  // "starting page must be before the ending page" error; a cleared "from
  // page" silently extracted from page 1 instead.
  it("rejects a cleared from-page instead of clamping it to 1", () => {
    const result = validatePageRange("", "10", 10);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/whole page number/);
  });

  it("rejects a cleared to-page instead of clamping it to 1", () => {
    const result = validatePageRange("5", "", 10);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/whole page number/);
  });

  it("rejects whitespace-only input", () => {
    expect(validatePageRange("   ", "5", 10).ok).toBe(false);
  });

  it("rejects non-numeric input", () => {
    expect(validatePageRange("abc", "5", 10).ok).toBe(false);
  });

  it("rejects fractional page numbers", () => {
    const result = validatePageRange("1.5", "5", 10);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/whole page number/);
  });

  it("rejects page numbers below 1", () => {
    const result = validatePageRange("0", "5", 10);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/between 1 and 10/);
  });

  it("rejects page numbers past the end of the document", () => {
    const result = validatePageRange("1", "11", 10);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/between 1 and 10/);
  });

  it("rejects an inverted range", () => {
    const result = validatePageRange("7", "2", 10);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/starting page must be before/);
  });

  it("reports the range error only once inputs are individually valid", () => {
    // 0 is out of range, so that error wins over the inversion check.
    expect(validatePageRange("0", "-1", 10).error).toMatch(/between 1 and 10/);
  });
});

describe("parsePageSelection", () => {
  it("parses a single page", () => {
    expect(parsePageSelection("5", 10)).toEqual({ ok: true, pages: [5] });
  });

  it("parses a range", () => {
    expect(parsePageSelection("2-5", 10)).toEqual({ ok: true, pages: [2, 3, 4, 5] });
  });

  // The reason this parser exists: two number boxes can only express one
  // contiguous run, so pulling three scattered sections out of a report
  // meant running the tool three times and merging by hand.
  it("parses a mix of pages and ranges", () => {
    expect(parsePageSelection("1-3, 7, 9-10", 10)).toEqual({
      ok: true,
      pages: [1, 2, 3, 7, 9, 10],
    });
  });

  it("tolerates spaces instead of commas", () => {
    expect(parsePageSelection("1-3 7", 10).pages).toEqual([1, 2, 3, 7]);
  });

  it("tolerates extra whitespace around separators", () => {
    expect(parsePageSelection("  1 - 3 ,  7  ", 10).pages).toEqual([1, 2, 3, 7]);
  });

  // Copying a range out of a document or chat client very often converts
  // the hyphen to an en dash.
  it("accepts an en dash as a range separator", () => {
    expect(parsePageSelection("2–4", 10).pages).toEqual([2, 3, 4]);
  });

  // Unambiguous, and rejecting it would only make the user type the pages
  // out individually to get the same result.
  it("reads a descending range as a deliberate reverse selection", () => {
    expect(parsePageSelection("5-2", 10).pages).toEqual([5, 4, 3, 2]);
  });

  // "3,1,3" is a legitimate instruction: page 3, then 1, then 3 again.
  it("preserves the requested order and keeps duplicates", () => {
    expect(parsePageSelection("3,1,3", 10).pages).toEqual([3, 1, 3]);
  });

  it("rejects an empty selection", () => {
    const result = parsePageSelection("", 10);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/1-3, 7, 12-15/);
  });

  it("rejects whitespace-only input", () => {
    expect(parsePageSelection("   ", 10).ok).toBe(false);
  });

  it("rejects a page past the end of the document", () => {
    const result = parsePageSelection("1-3, 25", 10);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/outside this PDF/);
  });

  it("rejects page zero", () => {
    expect(parsePageSelection("0-3", 10).ok).toBe(false);
  });

  it("names the offending token rather than failing generically", () => {
    const result = parsePageSelection("1-3, banana", 10);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("banana");
  });

  it("rejects a malformed range", () => {
    expect(parsePageSelection("1--3", 10).ok).toBe(false);
    expect(parsePageSelection("1-2-3", 10).ok).toBe(false);
  });

  it("rejects a selection made before a PDF is loaded", () => {
    const result = parsePageSelection("1-3", null);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Load a PDF/);
  });

  it("singularises the error for a one-page document", () => {
    expect(parsePageSelection("2", 1).error).toMatch(/it has 1 page\./);
  });
});

describe("formatPageSelection", () => {
  it("collapses a consecutive run into a range", () => {
    expect(formatPageSelection([1, 2, 3])).toBe("1-3");
  });

  it("leaves isolated pages alone", () => {
    expect(formatPageSelection([1, 5, 9])).toBe("1, 5, 9");
  });

  it("mixes runs and single pages", () => {
    expect(formatPageSelection([1, 2, 3, 7, 9, 10])).toBe("1-3, 7, 9-10");
  });

  // Writing a reversed selection as "5-2" would misrepresent the order the
  // pages actually come out in.
  it("does not collapse a descending selection", () => {
    expect(formatPageSelection([5, 4, 3])).toBe("5, 4, 3");
  });

  it("handles a single page and an empty list", () => {
    expect(formatPageSelection([7])).toBe("7");
    expect(formatPageSelection([])).toBe("");
    expect(formatPageSelection(null)).toBe("");
  });

  it("round-trips a selection through the parser", () => {
    const parsed = parsePageSelection("1-3, 7, 12-15", 20);
    expect(formatPageSelection(parsed.pages)).toBe("1-3, 7, 12-15");
  });
});
