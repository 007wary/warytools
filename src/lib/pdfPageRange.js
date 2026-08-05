// Validation for the Split PDF tool's page selection.
//
// Kept out of the client component so it's testable without a DOM, and
// deliberately string-in: <input type="number"> yields "" for a cleared box,
// and Number("") is 0. Coercing early made an empty field indistinguishable
// from a deliberate 0, which the old code then clamped to page 1 — silently
// extracting a range the user never asked for. The min/max attributes on the
// input only constrain the spinner arrows, so this is the real check.

/**
 * @param {string} fromValue Raw value of the "from page" input.
 * @param {string} toValue   Raw value of the "to page" input.
 * @param {number} pageCount Total pages in the loaded PDF.
 * @returns {{ok: true, from: number, to: number} | {ok: false, error: string}}
 */
export function validatePageRange(fromValue, toValue, pageCount) {
  const fromText = typeof fromValue === "string" ? fromValue.trim() : String(fromValue ?? "");
  const toText = typeof toValue === "string" ? toValue.trim() : String(toValue ?? "");

  const from = Number(fromText);
  const to = Number(toText);

  if (fromText === "" || toText === "" || !Number.isInteger(from) || !Number.isInteger(to)) {
    return { ok: false, error: "Enter a whole page number for both the start and end page." };
  }

  if (from < 1 || to < 1 || from > pageCount || to > pageCount) {
    return { ok: false, error: `Page numbers must be between 1 and ${pageCount}.` };
  }

  if (from > to) {
    return { ok: false, error: "The starting page must be before the ending page." };
  }

  return { ok: true, from, to };
}

/**
 * Parses a free-form page selection like "1-3, 7, 12-15".
 *
 * Two number boxes can only express one contiguous run, so pulling three
 * scattered sections out of a report meant running the tool three times and
 * merging the results by hand. This is the syntax every desktop print dialog
 * already uses, so it needs no explanation.
 *
 * Order is preserved and duplicates are kept: "3,1,3" is a deliberate
 * request for page 3, then 1, then 3 again. Deduplicating would quietly
 * refuse a legitimate instruction.
 *
 * @param {string} input     Raw text from the selection box.
 * @param {number} pageCount Total pages in the loaded PDF.
 * @returns {{ok: true, pages: number[]} | {ok: false, error: string}}
 *   `pages` holds 1-based page numbers in the requested order.
 */
export function parsePageSelection(input, pageCount) {
  const text = typeof input === "string" ? input.trim() : "";

  if (text === "") {
    return { ok: false, error: "Enter the pages you want, for example 1-3, 7, 12-15." };
  }

  if (!Number.isInteger(pageCount) || pageCount < 1) {
    return { ok: false, error: "Load a PDF before choosing pages." };
  }

  const pages = [];
  // Whitespace around a dash is closed up first, so "1 - 3" survives the
  // split below as one token. Without this it fragments into "1", "-", "3"
  // and reports the dash as an invalid page — but "1 - 3" is a perfectly
  // natural thing to type, especially after pasting.
  const normalised = text.replace(/\s*([-–])\s*/g, "$1");

  // Split on commas and whitespace so "1-3 7" works as well as "1-3, 7" —
  // people type both, and rejecting one of them serves nothing.
  const parts = normalised.split(/[,\s]+/).filter(Boolean);

  for (const part of parts) {
    // Accepts "5" or "2-8". An en dash is allowed because copying a range out
    // of a document or a chat client very often converts the hyphen.
    const match = /^(\d+)(?:\s*[-–]\s*(\d+))?$/.exec(part);

    if (!match) {
      return {
        ok: false,
        error: `"${part}" isn't a page or a range. Use numbers like 5 or ranges like 2-8.`,
      };
    }

    const start = Number(match[1]);
    // A bare number is a one-page range, which keeps the loop below uniform.
    const end = match[2] === undefined ? start : Number(match[2]);

    if (start < 1 || end < 1 || start > pageCount || end > pageCount) {
      return {
        ok: false,
        error: `"${part}" is outside this PDF — it has ${pageCount} page${pageCount === 1 ? "" : "s"}.`,
      };
    }

    // Descending ranges ("9-5") are read as a deliberate reverse selection
    // rather than an error: it's unambiguous, and rejecting it would just
    // make the user type the pages out individually to get the same result.
    if (start <= end) {
      for (let page = start; page <= end; page++) pages.push(page);
    } else {
      for (let page = start; page >= end; page--) pages.push(page);
    }
  }

  if (pages.length === 0) {
    return { ok: false, error: "Enter the pages you want, for example 1-3, 7, 12-15." };
  }

  return { ok: true, pages };
}

/**
 * Renders a page list back as compact range text ("1-3, 7, 12-15").
 *
 * Used to show what a selection resolved to, so a user can confirm that
 * "2-8, 11" meant what they thought before spending time on the export.
 *
 * @param {number[]} pages 1-based page numbers.
 */
export function formatPageSelection(pages) {
  if (!Array.isArray(pages) || pages.length === 0) return "";

  const groups = [];
  let start = pages[0];
  let previous = pages[0];

  for (let i = 1; i <= pages.length; i++) {
    const page = pages[i];
    // Only consecutive ascending runs collapse — a reversed selection is
    // shown page by page, because writing it as a range would misrepresent
    // the order the pages come out in.
    if (page === previous + 1) {
      previous = page;
      continue;
    }
    groups.push(start === previous ? `${start}` : `${start}-${previous}`);
    start = page;
    previous = page;
  }

  return groups.join(", ");
}
