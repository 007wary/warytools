// Acceptance rules, conversion options, and error mapping for Excel to PDF.
//
// The site's *fourth* tool that uploads, and it exists for the same reason
// wordToPdfLimits.js and powerPointToPdfLimits.js do: rendering a workbook to
// PDF means running a spreadsheet layout engine — column widths, merged cells,
// number formats, conditional formatting, charts, frozen panes, print ranges —
// and a browser has none. So the file goes to a LibreOffice Calc container
// (see services/excel-to-pdf/).
//
// This is the same direction as Word to PDF and PowerPoint to PDF: Office
// format *out* to PDF, LibreOffice's native strength. The objection recorded in
// services/pdf-to-word/README.md is about PDF *import* and does not apply.
//
// ---------------------------------------------------------------------------
// WHY THIS TOOL CARRIES OPTIONS WHEN THE OTHER THREE DO NOT
// ---------------------------------------------------------------------------
//
// This is the one real design difference, and it is not a nice-to-have.
//
// A .docx has a page size. A .pptx has a slide size. Both formats *are* laid
// out on a page already, so "convert to PDF" is unambiguous and the other two
// converters correctly expose no settings at all.
//
// **A spreadsheet has no page.** A sheet is an unbounded grid, and a PDF is a
// stack of fixed rectangles, so something has to decide where the grid is cut.
// If nobody decides, LibreOffice falls back to Calc's default — slice the sheet
// into portrait-width column strips — and a perfectly ordinary 12-column budget
// comes back as a 4-page PDF with columns 9-12 orphaned onto their own sheet,
// stripped of the row labels that made them mean anything.
//
// That is the single most-complained-about behaviour of every Excel-to-PDF
// converter, and shipping it as the default while hiding the fix behind an
// "advanced" disclosure would be shipping the complaint. So scaling and
// orientation are primary controls, chosen before conversion, and the default
// is FIT_WIDTH rather than Calc's own default. See SCALING_MODES below for why
// fit-width rather than fit-page.
//
// Per CLAUDE.md, guard logic lives in src/lib/ rather than inline in the client
// so it can actually be tested. The client, the API route, and (for the option
// contract) the service all import or mirror what is here; the route's copy is
// the one that counts, since the client's is bypassable by anyone posting
// directly.

/**
 * Hard ceiling on an uploaded workbook.
 *
 * The same 20 MB as the other three converters, deliberately: the number
 * answers "what can a shared container render without starving other requests",
 * and someone who has learned the limit on one tool should not meet a different
 * one here.
 *
 * This limit bites *least* hard on this format, which is worth knowing when
 * reading the rejection copy. A deck is mostly photographs and hits 20 MB
 * easily; a spreadsheet is mostly numbers and text, which compress to almost
 * nothing. A workbook that exceeds 20 MB is usually either genuinely enormous
 * (hundreds of thousands of rows) or carrying embedded images — so
 * rejectionMessage() points at the sheet count and print range rather than at
 * image compression, which is the Word/PowerPoint advice and would be useless.
 */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB

/**
 * Files above this convert fine but slowly enough that an unwarned user assumes
 * the tool has hung. Surfaced as a caution, not a rejection.
 *
 * Higher than the PowerPoint tool's 3 MB and matching the Word tool's 5 MB.
 * Bytes are a poor proxy for spreadsheet work — Calc's cost is driven by cell
 * count and formula recalculation rather than file size, and a 2 MB workbook
 * with a hundred thousand formulas is slower than a 10 MB one that is mostly a
 * single embedded image. 5 MB is where the correlation becomes reliable enough
 * to warn on without crying wolf on ordinary files.
 */
export const SLOW_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * How long to let a conversion run before giving up on it.
 *
 * Matched to the container's own soffice timeout. If these drift apart the
 * user-facing failure gets worse, not better: a route that gives up first
 * leaves a process still burning CPU with nobody waiting for the result.
 */
export const CONVERSION_TIMEOUT_MS = 60_000;

/**
 * How long the browser waits before giving up on the request entirely.
 *
 * Same layering as the other three converters: deliberately the longest timeout
 * in the chain, because every layer below it (container 55s, route 60s, Vercel
 * 90s) produces a real response the user can act on. This one exists only for
 * the case where none of them get to reply — a connection that stalls
 * mid-upload, which is ordinary on mobile.
 *
 * It must stay strictly greater than the route's maxDuration, or it would abort
 * conversions that were about to succeed and report a timeout that never was.
 */
export const CLIENT_TIMEOUT_MS = 120_000;

/**
 * Formats this tool accepts, keyed by the extension users actually have.
 *
 * `.xls` is included for the same reason `.doc` and `.ppt` are on the sibling
 * tools: it is precisely the format people still have archived and can no
 * longer open, which is often why they went looking for a converter at all.
 *
 * `.xlsm` is a macro-enabled workbook. It is accepted because it is structurally
 * a .xlsx — the macros live in a separate part that the PDF export never runs,
 * and LibreOffice does not execute them on import in headless mode. Refusing it
 * would refuse a file that converts perfectly.
 *
 * `.csv` is deliberately NOT here, and that is a real decision rather than an
 * omission. A CSV has no column widths, no fonts, and no print settings — every
 * PDF we could produce from one would be an invention rather than a rendering
 * of what the user saw, and the result would look nothing like the spreadsheet
 * they opened the file in. See the FAQ, which says so rather than leaving it
 * looking like an oversight.
 *
 * `.ods` comes free from the same engine.
 */
export const ACCEPTED_EXTENSIONS = [".xlsx", ".xls", ".xlsm", ".ods"];

/**
 * The `accept` attribute for the file picker.
 *
 * Both the MIME types and the extensions are listed, for the same reason
 * pdfFile.js does not trust `file.type`: the extension is what makes the picker
 * behave on the platforms whose MIME registry is empty or wrong.
 */
export const ACCEPT_ATTRIBUTE = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.ms-excel.sheet.macroEnabled.12",
  "application/vnd.oasis.opendocument.spreadsheet",
  ...ACCEPTED_EXTENSIONS,
].join(",");

// ---------------------------------------------------------------------------
// Conversion options
// ---------------------------------------------------------------------------

/**
 * How the sheet's columns are made to fit the paper.
 *
 * The values are the wire format: they travel from the client to the route to
 * the service as bare tags, and the service maps them onto Calc page-style
 * properties (ScaleToPagesX / ScaleToPages). They are deliberately opaque
 * strings rather than numbers, so a future mode can be added without any
 * arithmetic meaning being read into the existing ones.
 *
 * Why FIT_WIDTH is the default rather than FIT_PAGE, which sounds tidier:
 * a spreadsheet is almost always wide-and-long. Fitting the *whole* sheet onto
 * one page shrinks a 500-row ledger until the text is unreadable — technically
 * one page, practically useless, and the user cannot tell from the option name
 * that it will happen. Fitting the width alone caps the horizontal axis (the
 * one that causes orphaned columns) and lets rows flow down as many pages as
 * they need, which is what people mean when they say "make it fit".
 *
 * ORIGINAL is kept because it is the only honest way to get the workbook's own
 * embedded print setup — someone who has already configured print areas, scaling
 * and page breaks in Excel wants exactly that, and overriding it would silently
 * discard deliberate work.
 */
export const SCALING_MODES = ["fit-width", "fit-page", "original"];

/** Default scaling. Not Calc's default — see the note at the top of this file. */
export const DEFAULT_SCALING = "fit-width";

/**
 * Page orientation.
 *
 * "auto" is the default and is not a synonym for portrait. Spreadsheets are
 * predominantly wider than they are tall, so the service resolves "auto" to
 * landscape unless the workbook carries its own orientation in its print setup,
 * in which case that is respected. Forcing portrait on a wide sheet is the
 * other half of the orphaned-columns problem: even at fit-width, a 15-column
 * sheet squeezed into portrait is scaled down far enough to be unreadable, so
 * the two options are genuinely one decision and are presented together.
 */
export const ORIENTATIONS = ["auto", "landscape", "portrait"];

/** Default orientation. See ORIENTATIONS for why this is not "portrait". */
export const DEFAULT_ORIENTATION = "auto";

/**
 * Which sheets of the workbook to convert.
 *
 * Worth an option because a workbook is a container of sheets in a way a
 * document is not a container of documents. Real workbooks routinely carry
 * working sheets, lookup tables, and raw data dumps alongside the one sheet
 * anybody wants to send — converting all of them by default produces a 40-page
 * PDF where 3 pages were wanted.
 *
 * "all" remains the default nonetheless: it is the only choice that can never
 * silently omit something the user needed, and a wrong default that *adds*
 * pages is recoverable by the reader while one that *drops* them is not. The
 * same reasoning as the dropped-page handling in services/pdf-to-word.
 */
export const SHEET_SELECTIONS = ["all", "first"];

/** Default sheet selection. See SHEET_SELECTIONS for why "all" rather than "first". */
export const DEFAULT_SHEET_SELECTION = "all";

/**
 * Validates and fills in a set of conversion options.
 *
 * Always returns a complete, valid option set — it never fails. This is
 * deliberate and is the reason the function exists rather than a schema check:
 * these values arrive from a query-string-shaped header on an untrusted request,
 * and the correct response to a junk value is to convert the file with the
 * defaults, not to refuse a perfectly good workbook over a malformed setting the
 * user never typed. Nothing here can make a conversion unsafe; the worst a bad
 * value can do is produce a differently-paginated PDF.
 *
 * The route calls this on what it receives, so the service is only ever handed
 * values from the fixed lists above — which is what lets the service map them
 * onto macro parameters without escaping concerns.
 *
 * @param {{scaling?: string, orientation?: string, sheets?: string}} [options]
 * @returns {{scaling: string, orientation: string, sheets: string}}
 */
export function normalizeOptions(options = {}) {
  const pick = (value, allowed, fallback) => {
    const tag = String(value ?? "").toLowerCase().trim();
    return allowed.includes(tag) ? tag : fallback;
  };

  return {
    scaling: pick(options.scaling, SCALING_MODES, DEFAULT_SCALING),
    orientation: pick(options.orientation, ORIENTATIONS, DEFAULT_ORIENTATION),
    sheets: pick(options.sheets, SHEET_SELECTIONS, DEFAULT_SHEET_SELECTION),
  };
}

/**
 * Encodes options for the wire.
 *
 * A single header rather than three, so adding an option later does not mean
 * touching the header allowlist in every layer. Deliberately hand-rolled and
 * restricted to the three known keys rather than serialising whatever object it
 * is given: this string ends up in an HTTP header, and header values cannot
 * contain newlines without splitting the request. Every value it can emit comes
 * from normalizeOptions and is therefore already one of a dozen fixed tags, so
 * there is nothing to escape — but the restriction is what guarantees that
 * stays true if a caller passes something unexpected.
 *
 * @param {{scaling?: string, orientation?: string, sheets?: string}} options
 * @returns {string} e.g. "scaling=fit-width;orientation=auto;sheets=all"
 */
export function encodeOptions(options) {
  const safe = normalizeOptions(options);
  return `scaling=${safe.scaling};orientation=${safe.orientation};sheets=${safe.sheets}`;
}

/**
 * Decodes what encodeOptions produced.
 *
 * Tolerant of anything — a missing header, junk, a partial set — because it
 * runs on untrusted input and returns defaults for whatever it cannot read.
 * Round-trips with encodeOptions, which is what the tests assert: an option
 * that survives the client but is dropped in transit would silently convert
 * with the wrong pagination and look like a converter bug.
 *
 * @param {string} header
 * @returns {{scaling: string, orientation: string, sheets: string}}
 */
export function decodeOptions(header) {
  const parsed = {};

  for (const part of String(header || "").split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) parsed[key] = value;
  }

  return normalizeOptions(parsed);
}

/**
 * Human-readable summary of what a set of options will do.
 *
 * Rendered under the controls, because the option names alone do not predict
 * the outcome — "fit width" does not tell someone that their rows will still
 * span several pages, and that is exactly the expectation gap that makes a
 * converted spreadsheet look broken. Saying it before conversion is cheaper
 * than explaining it after.
 *
 * @param {{scaling: string, orientation: string, sheets: string}} options
 * @returns {string}
 */
export function describeOptions(options) {
  const safe = normalizeOptions(options);

  const scaling = {
    "fit-width": "All columns fit the page width; long sheets continue over multiple pages.",
    "fit-page": "Each sheet is shrunk onto a single page — check it stays readable.",
    original: "Uses the print setup saved in the workbook.",
  }[safe.scaling];

  const orientation = {
    auto: "Landscape, unless the workbook specifies otherwise.",
    landscape: "Landscape pages.",
    portrait: "Portrait pages.",
  }[safe.orientation];

  const sheets = {
    all: "Every sheet is included.",
    first: "Only the first sheet is included.",
  }[safe.sheets];

  return `${scaling} ${orientation} ${sheets}`;
}

// ---------------------------------------------------------------------------
// Size checks and copy
// ---------------------------------------------------------------------------

/**
 * Checks an upload's size before any bytes are read or forwarded.
 *
 * Size-only, because that's all the API route can cheaply know about a streamed
 * body. The magic-byte check lives in xlsxFile.js — the route runs that logic
 * too, but the ordering matters: size first, since refusing a 200 MB body must
 * not require reading it.
 *
 * @param {number} size Byte length of the upload.
 * @returns {{ok: true, isSlow: boolean} | {ok: false, reason: string}}
 */
export function checkUploadSize(size) {
  if (!Number.isFinite(size) || size <= 0) {
    return { ok: false, reason: "empty" };
  }

  if (size > MAX_UPLOAD_BYTES) {
    return { ok: false, reason: "too_large" };
  }

  return { ok: true, isSlow: size > SLOW_UPLOAD_BYTES };
}

/**
 * Maps a rejection reason onto user-facing copy.
 *
 * Kept beside the checks rather than in the client so the API route and the UI
 * can never disagree about what a given reason means.
 *
 * @param {string} reason
 * @returns {string}
 */
export function rejectionMessage(reason) {
  switch (reason) {
    case "empty":
      return "That file is empty (0 bytes). Try choosing it again.";
    case "too_large":
      // Points at sheets and print ranges, not at image compression. A workbook
      // over 20 MB is over it because of its rows, not its pictures — the
      // PowerPoint tool's "Compress Pictures" advice would be useless here.
      return `This tool converts spreadsheets up to ${formatLimit(MAX_UPLOAD_BYTES)}. Workbooks this large are usually carrying several big data sheets — try deleting the ones you don't need to send, or setting a print area around the range that matters.`;
    case "not_a_spreadsheet":
      return "That file isn't an Excel spreadsheet. Choose a .xlsx, .xls, .xlsm, or .ods file.";
    case "csv":
      // Its own reason rather than folding into not_a_spreadsheet: a CSV is a
      // near-miss that someone reasonably expected to work, and the answer is
      // an actual instruction rather than a list of accepted extensions.
      return "CSV files aren't supported, because a CSV has no column widths, fonts, or page setup — any PDF made from one would be invented rather than converted. Open it in Excel, save as .xlsx, then convert that.";
    case "unreadable":
      return "This spreadsheet appears to be damaged and couldn't be read. Try re-saving it from Excel, Google Sheets, or LibreOffice.";
    case "encrypted":
      return "This spreadsheet is password-protected. Open it in Excel, remove the password, then try again.";
    case "no_content":
      // A real Calc outcome, not a hypothetical: a workbook whose only sheets
      // are empty, or whose print area is set to an empty range, exports zero
      // pages. Without this the user gets "conversion failed" for a file that
      // is not damaged at all.
      return "This spreadsheet has nothing to print — its sheets are empty, or its print area is set to an empty range. Check the sheet has data, then try again.";
    case "unavailable":
      return "The converter is temporarily unavailable. Please try again in a few minutes.";
    case "timeout":
      return "This spreadsheet took too long to convert. Very large workbooks or ones with heavy formulas can exceed the time limit — try converting a single sheet, or setting a print area.";
    case "rate_limited":
      return "You've converted several files just now. Please wait a minute and try again.";
    default:
      return "Could not convert this spreadsheet. Please try again.";
  }
}

/**
 * Builds the output filename from the source.
 *
 * Strips any of the accepted extensions case-insensitively and falls back to a
 * generic name, so "Budget.XLSX" downloads as "Budget.pdf" rather than
 * "Budget.XLSX.pdf" and a file with no extension still gets a sensible name.
 *
 * @param {string} sourceName
 * @returns {string}
 */
export function pdfFilename(sourceName) {
  const base = String(sourceName || "")
    .replace(/\.(xlsx|xlsm|xlsb|xls|ods)$/i, "")
    .trim();
  if (!base) return "converted.pdf";
  return `${base}.pdf`;
}

function formatLimit(bytes) {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}
