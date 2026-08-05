// Validation for the Split PDF tool's "from page"/"to page" inputs.
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
