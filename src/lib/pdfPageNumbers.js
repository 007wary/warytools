// Page-number placement and formatting for Add Page Numbers.
//
// Pure functions, no pdf-lib: everything here decides *what text goes where*,
// which is the part that can be wrong in ways nothing throws about. Per the repo
// convention (and because there is no component-level coverage) that logic lives
// in src/lib/ where it can be tested, not inline in the client.
//
// All coordinates returned are PDF points in unrotated user space, ready to hand
// to pdf-lib's drawText. Two coordinate traps meet in placeNumber(), the same
// pair that cropGeometry.toPdfBox() exists for, and they fail the same silent
// way — see the comments there.

/** Where on the page the number sits. Nine positions, as a 3×3 grid. */
export const POSITIONS = [
  { id: "bottom-center", label: "Bottom centre", vertical: "bottom", horizontal: "center" },
  { id: "bottom-right", label: "Bottom right", vertical: "bottom", horizontal: "right" },
  { id: "bottom-left", label: "Bottom left", vertical: "bottom", horizontal: "left" },
  { id: "top-center", label: "Top centre", vertical: "top", horizontal: "center" },
  { id: "top-right", label: "Top right", vertical: "top", horizontal: "right" },
  { id: "top-left", label: "Top left", vertical: "top", horizontal: "left" },
];

/**
 * Number formats.
 *
 * `{n}` is the number and `{total}` the count of numbered pages — not the
 * document's page count. On a document where numbering starts at page 3, "Page 1
 * of 18" on the first numbered page of a 20-page file is what a reader expects;
 * "Page 1 of 20" would name a total the numbering never reaches.
 */
export const FORMATS = [
  { id: "plain", label: "1", template: "{n}" },
  { id: "page-n", label: "Page 1", template: "Page {n}" },
  { id: "n-of-total", label: "1 / 12", template: "{n} / {total}" },
  { id: "page-n-of-total", label: "Page 1 of 12", template: "Page {n} of {total}" },
];

/** Margin presets, in points. 36pt = half an inch, matching pdfPageSizes.js. */
export const MARGINS = [
  { id: "small", label: "Small", points: 18 },
  { id: "normal", label: "Normal", points: 36 },
  { id: "large", label: "Large", points: 54 },
];

/** Font size presets. Kept as a list rather than a free number input — see NumberField note in CLAUDE.md. */
export const FONT_SIZES = [8, 10, 12, 14, 18];

export const DEFAULT_SETTINGS = {
  positionId: "bottom-center",
  formatId: "plain",
  marginId: "normal",
  fontSize: 12,
  startNumber: 1,
  fromPage: 1,
};

/** Looks up a position descriptor, falling back to bottom-centre. */
export function findPosition(id) {
  return POSITIONS.find((position) => position.id === id) || POSITIONS[0];
}

/** Looks up a format descriptor, falling back to the bare number. */
export function findFormat(id) {
  return FORMATS.find((format) => format.id === id) || FORMATS[0];
}

/** Resolves a margin id to points. Unknown ids fall back to normal, not a crash. */
export function marginPoints(id) {
  const found = MARGINS.find((margin) => margin.id === id);
  return found ? found.points : 36;
}

/**
 * Builds the label for one page.
 *
 * @param {object} params
 * @param {string} params.formatId
 * @param {number} params.number The displayed number (already offset by startNumber).
 * @param {number} params.total  How many pages get numbered.
 * @returns {string}
 */
export function formatPageLabel({ formatId, number, total }) {
  const { template } = findFormat(formatId);
  return template.replace("{n}", String(number)).replace("{total}", String(total));
}

/**
 * Works out which pages get numbered and what number each one shows.
 *
 * Two separate knobs, because they answer two different questions and conflating
 * them is the usual reason this feature disappoints:
 *
 *   - `fromPage` is *which* page numbering starts on. A report with a cover and
 *     a contents page wants nothing printed on those two sheets.
 *   - `startNumber` is what the first numbered page is *called*. Sometimes 1
 *     (the cover isn't page 1), sometimes 3 (it is, it just wasn't stamped).
 *
 * A single "start at" control cannot express "skip the cover, and call the next
 * page 1" — the single most common real request — so both exist.
 *
 * @param {object} params
 * @param {number} params.pageCount   Pages in the document.
 * @param {number} params.fromPage    1-based page to start stamping on.
 * @param {number} params.startNumber Number shown on that first stamped page.
 * @returns {{index: number, number: number}[]} `index` is 0-based, for pdf-lib.
 */
export function planPageNumbers({ pageCount, fromPage = 1, startNumber = 1 }) {
  if (!Number.isFinite(pageCount) || pageCount < 1) return [];

  // Clamped rather than rejected: these arrive already validated from the
  // client, and a plan is a pure computation that should never throw over a
  // value the UI can simply not offer.
  const first = Math.min(Math.max(Math.trunc(fromPage) || 1, 1), pageCount);
  const start = Number.isFinite(startNumber) ? Math.trunc(startNumber) : 1;

  const plan = [];
  for (let index = first - 1; index < pageCount; index++) {
    plan.push({ index, number: start + (index - (first - 1)) });
  }
  return plan;
}

/**
 * Places a label on a page, in unrotated PDF user space.
 *
 * Two coordinate mismatches meet here, and — as in cropGeometry.toPdfBox() —
 * both produce perfectly valid-looking numbers when wrong, so neither throws:
 *
 *   - **PDF's origin is bottom-left, y increasing upward.** "Bottom of the page"
 *     is a small y, not a large one. Get this backwards and every number lands
 *     at the opposite end of the sheet.
 *   - **The page's /Rotate means "bottom" isn't where the box says it is.** On a
 *     page with /Rotate 90 the displayed bottom edge is one of the *sides* of
 *     the MediaBox. Ignoring it puts the number along the edge of the page,
 *     rotated a quarter turn — legible only by tilting your head, and invisible
 *     in a thumbnail check. So the target corner is chosen in *display* space
 *     and mapped back onto unrotated axes, and the text is given a matching
 *     `rotate` so it reads the right way up once the viewer applies /Rotate.
 *
 * The box passed in should be the page's CropBox where it has one: that is what
 * a reader displays, so a page cropped once has visible edges that the MediaBox
 * no longer describes, and measuring a margin from the MediaBox would push the
 * number outside the visible area entirely.
 *
 * @param {object} params
 * @param {string} params.positionId
 * @param {number} params.marginPoints Distance from the displayed page edges.
 * @param {number} params.textWidth    Width of the rendered label, in points.
 * @param {number} params.fontSize
 * @param {{x: number, y: number, width: number, height: number}} params.box
 * @param {number} params.rotation The page's /Rotate.
 * @returns {{x: number, y: number, rotate: number}} Ready for drawText.
 */
export function placeNumber({
  positionId,
  marginPoints: margin = 36,
  textWidth = 0,
  fontSize = 12,
  box,
  rotation = 0,
}) {
  const position = findPosition(positionId);

  const boxX = box?.x || 0;
  const boxY = box?.y || 0;
  const boxWidth = box?.width || 0;
  const boxHeight = box?.height || 0;

  // /Rotate is a multiple of 90 but real files carry negative and above-360
  // values, so normalise before comparing against 90/180/270.
  const angle = (((Math.round((rotation || 0) / 90) * 90) % 360) + 360) % 360;

  // Displayed dimensions: at 90 and 270 the axes swap, so a portrait MediaBox
  // presents as a landscape page and the margins apply to the other pair of
  // edges.
  const quarterTurned = angle === 90 || angle === 270;
  const displayWidth = quarterTurned ? boxHeight : boxWidth;
  const displayHeight = quarterTurned ? boxWidth : boxHeight;

  // Step 1: place the text in *display* space, top-left origin, as the user
  // sees the page. This is the frame the position labels ("bottom right") mean.
  let displayX;
  if (position.horizontal === "left") {
    displayX = margin;
  } else if (position.horizontal === "right") {
    displayX = displayWidth - margin - textWidth;
  } else {
    displayX = (displayWidth - textWidth) / 2;
  }

  // Measured to the text's *baseline*, which is what drawText positions from.
  // At the bottom the margin is the gap below the baseline; at the top it is the
  // gap above the glyphs, so the font size comes off it — without that a
  // top-positioned number sits a full line-height lower than a bottom-positioned
  // one at the same margin, which looks like a bug even though nothing failed.
  const displayY =
    position.vertical === "bottom" ? margin : displayHeight - margin - fontSize;

  // Step 2: map that point back onto unrotated user space, and rotate the text
  // to match so it reads correctly after the viewer applies /Rotate.
  //
  // Both display coordinates here are already bottom-left-origin (displayY is a
  // distance *up* from the displayed bottom edge), so the only work left is the
  // quarter-turn mapping.
  let x;
  let y;

  if (angle === 90) {
    // A viewer showing a /Rotate 90 page maps user-space (x, y) to displayed
    // (y, x) — so inverting it swaps the pair straight across. The displayed
    // bottom edge is therefore the unrotated LEFT edge, not the right one.
    x = displayY;
    y = displayX;
  } else if (angle === 180) {
    x = boxWidth - displayX;
    y = boxHeight - displayY;
  } else if (angle === 270) {
    // At 270 the viewer maps (x, y) to (height - y, width - x), so the inverse
    // mirrors both axes after the swap.
    x = boxWidth - displayY;
    y = boxHeight - displayX;
  } else {
    x = displayX;
    y = displayY;
  }

  return {
    // The box origin is added last. It is usually zero, but a page that has been
    // cropped once carries a non-zero origin, and dropping it puts the number
    // off the visible area — the same offset cropGeometry.toPdfBox() preserves.
    x: boxX + x,
    y: boxY + y,
    // pdf-lib rotates text counter-clockwise; /Rotate turns the page clockwise.
    // So the text is turned by the same angle to come out upright.
    rotate: angle,
  };
}

/**
 * Describes the settings for the UI, so the result is knowable before running.
 *
 * @returns {string} e.g. "Pages 3-20 numbered 1-18, bottom centre"
 */
export function describePlan(plan, positionId) {
  if (!plan || plan.length === 0) return "No pages will be numbered.";

  const first = plan[0];
  const last = plan[plan.length - 1];
  const position = findPosition(positionId).label.toLowerCase();

  if (plan.length === 1) {
    return `Page ${first.index + 1} numbered "${first.number}", ${position}.`;
  }

  return `Pages ${first.index + 1}-${last.index + 1} numbered ${first.number}-${last.number}, ${position}.`;
}

/**
 * Validates the two numeric inputs.
 *
 * String-in on purpose, for the reason pdfPageRange.js documents: Number("") is
 * 0, so coercing early makes a cleared field indistinguishable from a deliberate
 * zero. The min/max attributes on an input only constrain the spinner arrows.
 *
 * @param {string} fromValue  Raw "start on page" input.
 * @param {string} startValue Raw "first number" input.
 * @param {number} pageCount
 * @returns {{ok: true, fromPage: number, startNumber: number} | {ok: false, error: string}}
 */
export function validateNumbering(fromValue, startValue, pageCount) {
  const fromText = typeof fromValue === "string" ? fromValue.trim() : String(fromValue ?? "");
  const startText = typeof startValue === "string" ? startValue.trim() : String(startValue ?? "");

  if (fromText === "" || startText === "") {
    return { ok: false, error: "Enter a whole number for both the start page and the first number." };
  }

  const fromPage = Number(fromText);
  const startNumber = Number(startText);

  if (!Number.isInteger(fromPage) || !Number.isInteger(startNumber)) {
    return { ok: false, error: "Enter a whole number for both the start page and the first number." };
  }

  if (fromPage < 1 || fromPage > pageCount) {
    return {
      ok: false,
      error: `The start page must be between 1 and ${pageCount}.`,
    };
  }

  // Zero and negatives are refused rather than clamped. A page numbered "-2"
  // is never what someone meant, and silently correcting it to 1 would stamp
  // the whole document with numbers they didn't ask for.
  if (startNumber < 1) {
    return { ok: false, error: "The first number must be 1 or greater." };
  }

  return { ok: true, fromPage, startNumber };
}
