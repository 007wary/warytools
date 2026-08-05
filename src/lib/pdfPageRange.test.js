import { describe, it, expect } from "vitest";
import { validatePageRange } from "./pdfPageRange";

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
