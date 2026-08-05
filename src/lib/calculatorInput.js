// Input parsing and validation for the calculators.
//
// This exists because of the rule in CLAUDE.md: logic that guards a user input
// belongs in src/lib/, not inline in a client component — there is no
// component-level test coverage, so inline validation is validation nobody can
// verify. Every calculator previously did its own `Number(x)` +
// `!Number.isNaN(x)` check inline, and all of them shared the same three bugs:
//
//   1. `Number("")` is 0, so a *cleared* field was indistinguishable from a
//      deliberate zero. (Same gotcha that bit Split PDF and Resize Image.)
//   2. `!Number.isNaN()` accepts Infinity — `Number("Infinity")` is a finite-
//      looking pass that then renders the literal string "Infinity" as a
//      result. Only `Number.isFinite` actually means "a usable number".
//   3. `Number(" 12 ")` is 12 but `Number("12abc")` is NaN, so whitespace was
//      silently accepted while a stray character failed with no explanation.
//
// Callers hold the raw *string* in state (never a number) and run it through
// here on every render. The `min`/`max` attributes on a numeric <input> only
// constrain the spinner arrows; they validate nothing.

// Beyond this magnitude, formatting degrades to exponential notation and the
// arithmetic stops being meaningful for the money/measurement domains these
// calculators cover. Rejecting here gives an actionable message instead of a
// result panel reading "1e+21".
export const MAX_MAGNITUDE = 1e15;

/**
 * Parses a raw input string into a usable number.
 *
 * Returns a discriminated result rather than throwing or returning NaN, so a
 * caller can distinguish "nothing typed yet" (render nothing) from "typed
 * something invalid" (render an error) — a distinction every calculator needs
 * and none of them could previously make.
 *
 * @returns {{ok: true, value: number} | {ok: false, empty: boolean, error: string}}
 */
export function parseNumber(raw, options = {}) {
  const {
    label = "Value",
    min = -Infinity,
    max = Infinity,
    integer = false,
    allowNegative = true,
  } = options;

  const trimmed = typeof raw === "string" ? raw.trim() : String(raw ?? "").trim();

  if (trimmed === "") {
    return { ok: false, empty: true, error: "" };
  }

  // Number() tolerates things this domain should not: "0x10", "1e5" written by
  // hand, and Infinity. Restrict to plain decimal notation, optionally signed.
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(trimmed)) {
    return { ok: false, empty: false, error: `${label} must be a number.` };
  }

  const value = Number(trimmed);

  if (!Number.isFinite(value)) {
    return { ok: false, empty: false, error: `${label} must be a number.` };
  }

  if (integer && !Number.isInteger(value)) {
    return { ok: false, empty: false, error: `${label} must be a whole number.` };
  }

  if (!allowNegative && value < 0) {
    return { ok: false, empty: false, error: `${label} can't be negative.` };
  }

  if (value < min) {
    return { ok: false, empty: false, error: `${label} must be at least ${min}.` };
  }

  if (value > max) {
    return { ok: false, empty: false, error: `${label} must be ${max} or less.` };
  }

  if (Math.abs(value) > MAX_MAGNITUDE) {
    return { ok: false, empty: false, error: `${label} is too large to calculate accurately.` };
  }

  return { ok: true, value };
}

/**
 * A pre-validated value wearing the same shape parseNumber returns.
 *
 * Used where a value comes from a constrained control (a rate chosen from
 * fixed slabs, say) rather than free text, so call sites can treat "picked
 * from a list" and "typed into a field" identically instead of hand-rolling a
 * partial `{ ok: true }` object that is missing `empty`/`error`.
 */
export function okValue(value) {
  return { ok: true, value, empty: false, error: "" };
}

/**
 * Parses several fields at once and reports the first real error.
 *
 * `fields` is an object of `{ name: [rawValue, options] }`. The combined result
 * separates "still incomplete" from "invalid" for the same reason parseNumber
 * does: a half-filled form should be quiet, not red.
 *
 * @returns {{ok: true, values: Record<string, number>} |
 *           {ok: false, incomplete: boolean, error: string}}
 */
export function parseFields(fields) {
  const values = {};
  let incomplete = false;
  let firstError = "";

  for (const [name, [raw, options]] of Object.entries(fields)) {
    const parsed = parseNumber(raw, options);
    if (parsed.ok) {
      values[name] = parsed.value;
      continue;
    }
    if (parsed.empty) {
      incomplete = true;
    } else if (!firstError) {
      firstError = parsed.error;
    }
  }

  // A genuine error outranks incompleteness: if one field is nonsense, say so
  // even while another is still blank, otherwise the message never appears
  // until the very last field is filled.
  if (firstError) return { ok: false, incomplete: false, error: firstError };
  if (incomplete) return { ok: false, incomplete: true, error: "" };

  return { ok: true, values };
}

/**
 * Normalises what a user pastes into a numeric field.
 *
 * People paste "1,234.56", "₹1,234", and "1 234" out of spreadsheets and
 * invoices constantly; every one of those was previously rejected outright.
 * Stripping the noise on input is far friendlier than an error message.
 * Note this deliberately does NOT strip the decimal point or sign.
 */
export function sanitizeNumericInput(raw) {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/[\s,_]/g, "")
    .replace(/[₹$€£]/g, "")
    // Full-width and Devanagari digits arrive from mobile keyboards.
    .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0))
    .replace(/[०-९]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0x0966 + 48));
}

/**
 * Clamps a number into a range, used by controls (sliders, steppers) where an
 * out-of-range value should be corrected rather than rejected.
 */
export function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}
