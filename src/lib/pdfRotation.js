// A page's /Rotate, normalised.
//
// Every tool in the PDF pipeline that cares about page orientation needs the
// same two things, and both are easy to get subtly wrong in ways that produce
// perfectly valid numbers and a visibly wrong document:
//
//   1. /Rotate is a multiple of 90, but the spec does not require it to be in
//      the range 0-359. Real files carry negative values (-90 for a landscape
//      scan is common, written by several scanner drivers) and values at or
//      above 360.
//   2. JavaScript's % keeps the sign of the dividend, so the obvious
//      `(current + extra) % 360` yields -180 for a page at -270 turned by 90.
//
// pdf-lib's setRotation only asserts a multiple of 90, so a negative result is
// written without complaint — and readers disagree about what a negative
// /Rotate means. The page then appears correct in one viewer and turned the
// wrong way in another, which is the worst version of this bug because whoever
// exported it cannot reproduce what their recipient sees.
//
// cropGeometry, pdfWatermark and pdfSignature each grew their own copy of the
// normalisation for exactly this reason. This is the one that new code should
// use; the existing three are left alone deliberately, since each is covered by
// its own round-trip tests and rewriting working coordinate code to share a
// helper is how inverted-mapping bugs get introduced.

/**
 * Normalises any /Rotate value onto one of 0, 90, 180, 270.
 *
 * Rounds to the nearest quarter turn first: a handful of generators write
 * near-multiples (89.9994) from a float round-trip, and pdf-lib's setRotation
 * rejects those outright, failing an otherwise perfectly good document over a
 * rounding error in someone else's writer.
 *
 * @param {number} rotation Any angle, including negative and >= 360.
 * @returns {0|90|180|270}
 */
export function normalizePageRotation(rotation) {
  const angle = Number.isFinite(rotation) ? rotation : 0;
  return (((Math.round(angle / 90) * 90) % 360) + 360) % 360;
}

/**
 * Adds a quarter-turn to a page's existing rotation.
 *
 * `extra` is the turn the user asked for, on top of whatever the page already
 * carries — so a page that was already landscape stays consistent with what the
 * preview showed.
 *
 * @param {number} current The page's own /Rotate.
 * @param {number} extra   The additional turn, in degrees.
 * @returns {0|90|180|270}
 */
export function addPageRotation(current, extra) {
  return normalizePageRotation(normalizePageRotation(current) + normalizePageRotation(extra));
}

/**
 * True when a page displays with its axes swapped.
 *
 * A page at 90 or 270 shows landscape when getSize() reports portrait, so any
 * sizing or aspect maths measured against the raw box is wrong on exactly those
 * pages — and only on those pages, which is why it survives casual testing.
 *
 * @param {number} rotation
 * @returns {boolean}
 */
export function isQuarterTurned(rotation) {
  const angle = normalizePageRotation(rotation);
  return angle === 90 || angle === 270;
}
