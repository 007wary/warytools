import { describe, it, expect } from "vitest";
import {
  invertSelection,
  normalizeSelection,
  validateDeletion,
  validateExtraction,
  toPageIndices,
  applyPageClick,
  parseSelectionText,
  describeSelection,
  outputFilename,
} from "./pdfPageSelection";

describe("invertSelection", () => {
  it("returns the pages that are not selected, ascending", () => {
    expect(invertSelection([2, 4], 6)).toEqual([1, 3, 5, 6]);
  });

  it("ignores click order — a deletion has no ordering of its own", () => {
    expect(invertSelection([5, 1, 3], 6)).toEqual([2, 4, 6]);
  });

  it("returns every page when nothing is selected", () => {
    expect(invertSelection([], 3)).toEqual([1, 2, 3]);
  });

  it("returns nothing when everything is selected", () => {
    expect(invertSelection([1, 2, 3], 3)).toEqual([]);
  });

  it("ignores selections outside the document", () => {
    expect(invertSelection([0, 4, 99], 3)).toEqual([1, 2, 3]);
  });

  it("tolerates duplicates", () => {
    expect(invertSelection([2, 2, 2], 4)).toEqual([1, 3, 4]);
  });

  it("returns nothing for an unusable page count", () => {
    expect(invertSelection([1], 0)).toEqual([]);
    expect(invertSelection([1], null)).toEqual([]);
  });

  // The two tools are complements of each other by construction, so the
  // property that matters is that keeping and removing partition the
  // document exactly — no page counted twice, none lost.
  it("partitions the document: keep + remove covers every page exactly once", () => {
    const pageCount = 12;
    const removed = [3, 7, 8, 11];
    const kept = invertSelection(removed, pageCount);

    expect([...kept, ...removed].sort((a, b) => a - b)).toEqual(
      Array.from({ length: pageCount }, (_, i) => i + 1)
    );
    expect(kept.some((page) => removed.includes(page))).toBe(false);
  });
});

describe("normalizeSelection", () => {
  it("sorts and deduplicates", () => {
    expect(normalizeSelection([5, 1, 5, 3], 6)).toEqual([1, 3, 5]);
  });

  it("drops pages outside the document", () => {
    expect(normalizeSelection([0, 1, 7, -2], 5)).toEqual([1]);
  });

  it("drops non-integers", () => {
    expect(normalizeSelection([1.5, 2, NaN, "3"], 5)).toEqual([2]);
  });
});

describe("validateDeletion", () => {
  it("accepts a partial selection and reports both sides", () => {
    const result = validateDeletion([2, 3], 5);
    expect(result).toEqual({ ok: true, keep: [1, 4, 5], removed: [2, 3] });
  });

  it("refuses an empty selection", () => {
    const result = validateDeletion([], 5);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/at least one page to delete/i);
  });

  // A zero-page PDF is a file pdf-lib writes happily and most readers refuse
  // to open — a download that looks like success and isn't.
  it("refuses to delete every page", () => {
    const result = validateDeletion([1, 2, 3], 3);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/at least one page/i);
  });

  it("refuses when out-of-range entries would still empty the document", () => {
    const result = validateDeletion([1, 2, 3, 99], 3);
    expect(result.ok).toBe(false);
  });

  it("refuses before a document is loaded", () => {
    expect(validateDeletion([1], 0).ok).toBe(false);
    expect(validateDeletion([1], null).ok).toBe(false);
  });

  it("leaves a single page behind on a two-page document", () => {
    expect(validateDeletion([1], 2)).toEqual({ ok: true, keep: [2], removed: [1] });
  });
});

describe("validateExtraction", () => {
  it("accepts a selection and preserves the requested order", () => {
    expect(validateExtraction([3, 1, 2], 5)).toEqual({ ok: true, pages: [3, 1, 2] });
  });

  // Unlike a deletion, repeating a page in an extraction is meaningful:
  // "1,1" is a request for two copies of page 1.
  it("preserves duplicates", () => {
    expect(validateExtraction([1, 1], 3)).toEqual({ ok: true, pages: [1, 1] });
  });

  it("accepts every page — extracting all of them is redundant, not wrong", () => {
    expect(validateExtraction([1, 2, 3], 3).ok).toBe(true);
  });

  it("refuses an empty selection", () => {
    const result = validateExtraction([], 5);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/at least one page to extract/i);
  });

  it("drops out-of-range pages and refuses if nothing valid remains", () => {
    expect(validateExtraction([9, 10], 5).ok).toBe(false);
    expect(validateExtraction([2, 99], 5)).toEqual({ ok: true, pages: [2] });
  });

  it("refuses before a document is loaded", () => {
    expect(validateExtraction([1], null).ok).toBe(false);
  });
});

describe("toPageIndices", () => {
  it("shifts 1-based page numbers down to 0-based indices", () => {
    expect(toPageIndices([1, 2, 5])).toEqual([0, 1, 4]);
  });

  it("preserves order and duplicates", () => {
    expect(toPageIndices([3, 1, 3])).toEqual([2, 0, 2]);
  });

  it("handles an empty list", () => {
    expect(toPageIndices([])).toEqual([]);
    expect(toPageIndices(null)).toEqual([]);
  });

  // The boundary the off-by-one would show at: the first and last pages of a
  // document must map to index 0 and pageCount-1, never -1 or pageCount.
  it("maps the document's edges correctly", () => {
    const pageCount = 10;
    const indices = toPageIndices([1, pageCount]);
    expect(indices[0]).toBe(0);
    expect(indices[1]).toBe(pageCount - 1);
  });
});

describe("applyPageClick", () => {
  it("adds an unselected page", () => {
    expect([...applyPageClick(new Set(), 3, {}, 10)]).toEqual([3]);
  });

  it("removes an already-selected page", () => {
    expect([...applyPageClick(new Set([3]), 3, {}, 10)]).toEqual([]);
  });

  // React compares by identity, so mutating the incoming Set would leave the
  // grid showing a stale selection with no error anywhere.
  it("always returns a new Set", () => {
    const current = new Set([1]);
    expect(applyPageClick(current, 2, {}, 10)).not.toBe(current);
    expect([...current]).toEqual([1]);
  });

  it("shift-clicks the run between the anchor and the click", () => {
    const result = applyPageClick(new Set([2]), 5, { shiftKey: true, anchor: 2 }, 10);
    expect([...result].sort((a, b) => a - b)).toEqual([2, 3, 4, 5]);
  });

  it("shift-clicks backwards to the same run", () => {
    const forward = applyPageClick(new Set(), 7, { shiftKey: true, anchor: 3 }, 10);
    const backward = applyPageClick(new Set(), 3, { shiftKey: true, anchor: 7 }, 10);
    expect([...forward].sort((a, b) => a - b)).toEqual([...backward].sort((a, b) => a - b));
  });

  // Shift extends, never toggles — a shift-click across a partly-selected
  // range must fill it, not punch holes in it.
  it("only adds on shift-click, even over already-selected pages", () => {
    const result = applyPageClick(new Set([2, 3]), 5, { shiftKey: true, anchor: 1 }, 10);
    expect([...result].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it("falls back to a plain toggle when there is no anchor yet", () => {
    const result = applyPageClick(new Set(), 4, { shiftKey: true, anchor: null }, 10);
    expect([...result]).toEqual([4]);
  });

  it("ignores clicks outside the document", () => {
    expect([...applyPageClick(new Set([1]), 0, {}, 5)]).toEqual([1]);
    expect([...applyPageClick(new Set([1]), 99, {}, 5)]).toEqual([1]);
  });

  it("ignores an anchor outside the document", () => {
    const result = applyPageClick(new Set(), 3, { shiftKey: true, anchor: 99 }, 5);
    expect([...result]).toEqual([3]);
  });

  it("shift-clicking the anchor itself selects just that page", () => {
    const result = applyPageClick(new Set(), 4, { shiftKey: true, anchor: 4 }, 10);
    expect([...result]).toEqual([4]);
  });
});

describe("parseSelectionText", () => {
  it("parses ranges into a set", () => {
    const result = parseSelectionText("1-3, 7", 10);
    expect(result.ok).toBe(true);
    expect([...result.set].sort((a, b) => a - b)).toEqual([1, 2, 3, 7]);
  });

  it("keeps the ordered array alongside the set", () => {
    const result = parseSelectionText("3,1", 5);
    expect(result.pages).toEqual([3, 1]);
  });

  it("passes through the underlying parser's errors", () => {
    const result = parseSelectionText("abc", 10);
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("rejects a range past the end of the document", () => {
    expect(parseSelectionText("1-20", 10).ok).toBe(false);
  });
});

describe("describeSelection", () => {
  it("collapses consecutive pages into ranges", () => {
    expect(describeSelection([1, 2, 3, 7], 10)).toBe("1-3, 7");
  });

  // Click order arrives unsorted; formatPageSelection only collapses
  // ascending runs, so an unsorted list would render a contiguous block as a
  // scattered one and make the selection look wrong.
  it("sorts click order before collapsing", () => {
    expect(describeSelection([3, 1, 2], 10)).toBe("1-3");
  });

  it("is empty for an empty selection", () => {
    expect(describeSelection([], 10)).toBe("");
  });

  it("round-trips through parseSelectionText", () => {
    const original = [1, 2, 3, 7, 12, 13, 14, 15];
    const text = describeSelection(original, 20);
    const parsed = parseSelectionText(text, 20);
    expect([...parsed.set].sort((a, b) => a - b)).toEqual(original);
  });
});

describe("outputFilename", () => {
  it("appends the suffix to the source name", () => {
    expect(outputFilename("report.pdf", "pages-removed")).toBe("report-pages-removed.pdf");
  });

  it("strips the extension case-insensitively", () => {
    expect(outputFilename("Report.PDF", "extracted")).toBe("Report-extracted.pdf");
  });

  it("falls back when there is no usable name", () => {
    expect(outputFilename("", "extracted")).toBe("document-extracted.pdf");
    expect(outputFilename("   ", "extracted")).toBe("document-extracted.pdf");
    expect(outputFilename(null, "extracted")).toBe("document-extracted.pdf");
  });

  it("truncates a very long name so the download isn't silently renamed", () => {
    const name = `${"a".repeat(300)}.pdf`;
    const out = outputFilename(name, "extracted");
    expect(out.length).toBeLessThan(120);
    expect(out.endsWith("-extracted.pdf")).toBe(true);
  });
});
