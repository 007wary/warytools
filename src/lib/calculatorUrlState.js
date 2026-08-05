// Shareable calculator state in the query string.
//
// Every calculator previously lost its inputs the moment the tab closed and
// could not be linked at all — you could not send someone "18% GST on ₹4,999"
// or bookmark "cm to inches". That is the single biggest gap versus the tools
// people compare us against, and it is free SEO: a shared link is a real link.
//
// Two rules shape the implementation:
//
//   1. Encoding must be *lossless for strings*. Calculator inputs are held as
//      raw strings (see the numeric-input gotcha in CLAUDE.md), so the round
//      trip is string -> query -> string. Parsing to a number and back would
//      turn a half-typed "12." into "12" under the user's cursor.
//   2. Writing must not create history entries. These update on every
//      keystroke, so pushState would make the back button walk backwards
//      through every character the user typed. replaceState is the correct
//      primitive here.

/**
 * Builds a query string from a state object.
 *
 * Empty, null, and undefined values are omitted so a pristine calculator has a
 * clean URL rather than a trail of `?x=&y=`. Values are compared against
 * `defaults` and omitted when unchanged, keeping shared links short and
 * readable — the point of a share link is that a human can look at it.
 */
export function encodeState(state, defaults = {}) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(state)) {
    if (value === null || value === undefined || value === "") continue;
    const asString = String(value);
    if (Object.prototype.hasOwnProperty.call(defaults, key)) {
      if (asString === String(defaults[key])) continue;
    }
    params.set(key, asString);
  }

  params.sort(); // Stable ordering, so the same state always yields the same URL.
  return params.toString();
}

/**
 * Reads state back out of a query string.
 *
 * `schema` maps each key to an allowed shape, so a hand-edited or malicious
 * URL cannot push arbitrary values into the UI:
 *   - `"string"`  — any string, length-capped
 *   - `"number"`  — must look like a plain decimal (the same grammar
 *                   calculatorInput accepts); kept as a *string*
 *   - `"date"`    — must be YYYY-MM-DD
 *   - `string[]`  — must be one of these exact values (modes, unit ids)
 *
 * Anything failing its schema is dropped rather than defaulting, so a partly
 * broken URL still restores the parts that were valid.
 */
export function decodeState(search, schema, defaults = {}) {
  const params = new URLSearchParams(search || "");
  const state = { ...defaults };

  for (const [key, shape] of Object.entries(schema)) {
    if (!params.has(key)) continue;
    const raw = params.get(key);
    if (raw == null) continue;

    if (Array.isArray(shape)) {
      if (shape.includes(raw)) state[key] = raw;
      continue;
    }

    if (shape === "number") {
      // Same grammar as calculatorInput.parseNumber, kept as a string so the
      // input keeps whatever the sharer typed.
      if (/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(raw) && raw.length <= 24) {
        state[key] = raw;
      }
      continue;
    }

    if (shape === "date") {
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) state[key] = raw;
      continue;
    }

    if (shape === "string") {
      state[key] = raw.slice(0, 120);
    }
  }

  return state;
}

/**
 * Writes state into the address bar without adding a history entry.
 *
 * Safe to call unconditionally: it no-ops during SSR and skips the write when
 * the URL would not actually change, so it can live in an effect that runs on
 * every keystroke without churning the History API.
 */
export function writeStateToUrl(state, defaults = {}) {
  if (typeof window === "undefined") return;

  const query = encodeState(state, defaults);
  const next = `${window.location.pathname}${query ? `?${query}` : ""}`;

  if (next === `${window.location.pathname}${window.location.search}`) return;

  try {
    window.history.replaceState(null, "", next);
  } catch {
    // Some embedded/sandboxed contexts throw on History access. A calculator
    // that works but can't be linked is fine; one that crashes is not.
  }
}

/**
 * Absolute URL for the current state, for the "copy link" button.
 */
export function shareableUrl(state, defaults = {}) {
  if (typeof window === "undefined") return "";
  const query = encodeState(state, defaults);
  return `${window.location.origin}${window.location.pathname}${query ? `?${query}` : ""}`;
}
