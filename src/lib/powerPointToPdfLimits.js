// Acceptance rules and error mapping for the PowerPoint-to-PDF converter.
//
// The site's *third* tool that uploads, and it exists for exactly the reason
// wordToPdfLimits.js does: rendering a deck to PDF means laying out slides —
// masters, placeholders, theme fonts, embedded charts, speaker-notes geometry,
// slide dimensions — and a browser has no presentation layout engine. So the
// file goes to a LibreOffice Impress container (see services/powerpoint-to-pdf/).
//
// This is the same direction as Word to PDF, not the opposite one: Office
// format *out* to PDF, which is LibreOffice's native strength. The objection
// recorded in services/pdf-to-word/README.md is about PDF *import*, and does
// not apply here. See that README before proposing a different engine.
//
// Per CLAUDE.md, guard logic lives in src/lib/ rather than inline in the
// client so it can actually be tested. Both the client and the API route
// import from here; the route is the one that counts, since the client's copy
// is bypassable by anyone posting directly.

/**
 * Hard ceiling on an uploaded presentation.
 *
 * Deliberately the same 20 MB as both document converters, for the same reason
 * they match each other: the number answers "what can a shared container
 * render without starving other requests", and a user who has met the limit on
 * one tool should not have to learn a second one here.
 *
 * This limit bites harder on this format than on the others, and that is worth
 * knowing rather than discovering. A .docx is mostly text and compresses to
 * almost nothing; a deck is mostly *images*, often full-bleed photographs, one
 * per slide. A 40-slide deck built from stock photography passes 20 MB without
 * being unusual in any way, which is why rejectionMessage() for this tool
 * points at compressing the images rather than at splitting the file.
 */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB

/**
 * Files above this convert fine but slowly enough that a user with no warning
 * assumes the tool has hung. Surfaced as a caution, not a rejection.
 *
 * Lower than the Word tool's 5 MB threshold. Impress is slower per byte than
 * Writer — it rasterises image-heavy slides and resolves a theme and master
 * per slide — so the point at which a conversion feels stalled arrives sooner.
 */
export const SLOW_UPLOAD_BYTES = 3 * 1024 * 1024; // 3 MB

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
 * Same layering as the other two converters: deliberately the longest timeout
 * in the chain, because every layer below it (container 55s, route 60s, Vercel
 * 90s) produces a real response the user can act on. This one exists only for
 * the case where none of them get to reply — a connection that stalls
 * mid-upload, which is ordinary on mobile.
 *
 * It must stay strictly greater than the route's maxDuration, or it would
 * abort conversions that were about to succeed and report a timeout that never
 * happened.
 */
export const CLIENT_TIMEOUT_MS = 120_000;

/**
 * Formats this tool accepts, keyed by the extension users actually have.
 *
 * `.ppt` is included for the same reason `.doc` is on the Word tool: it is
 * precisely the format people still have archived and can no longer open,
 * which is often why they went looking for a converter at all.
 *
 * `.pps` / `.ppsx` are slideshow-mode saves. They are byte-identical to their
 * `.ppt`/`.pptx` counterparts apart from how PowerPoint opens them, so
 * refusing one would be refusing a file the converter handles perfectly.
 *
 * `.odp` comes free from the same engine.
 */
export const ACCEPTED_EXTENSIONS = [".pptx", ".ppt", ".ppsx", ".pps", ".odp"];

/**
 * The `accept` attribute for the file picker.
 *
 * Both the MIME types and the extensions are listed, for the same reason
 * pdfFile.js does not trust `file.type`: the extension is what makes the
 * picker behave on the platforms whose MIME registry is empty or wrong.
 */
export const ACCEPT_ATTRIBUTE = [
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.presentationml.slideshow",
  "application/vnd.ms-powerpoint",
  "application/vnd.oasis.opendocument.presentation",
  ...ACCEPTED_EXTENSIONS,
].join(",");

/**
 * Checks an upload's size before any bytes are read or forwarded.
 *
 * Size-only, because that's all the API route can cheaply know about a
 * streamed body. The magic-byte check lives in pptxFile.js — the route runs
 * that logic too, but the ordering matters: size first, since refusing a
 * 200 MB body must not require reading it.
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
      // Points at image compression rather than at splitting the deck: a
      // presentation is over the limit because of its pictures far more often
      // than because of its slide count, and PowerPoint ships the fix
      // (Compress Pictures) built in.
      return `This tool converts presentations up to ${formatLimit(MAX_UPLOAD_BYTES)}. Decks are usually large because of their images — in PowerPoint, try File → Compress Pictures, or split the deck into two.`;
    case "not_a_presentation":
      return "That file isn't a PowerPoint presentation. Choose a .pptx, .ppt, .ppsx, or .odp file.";
    case "unreadable":
      return "This presentation appears to be damaged and couldn't be read. Try re-saving it from PowerPoint, Google Slides, or LibreOffice.";
    case "encrypted":
      return "This presentation is password-protected. Open it in PowerPoint, remove the password, then try again.";
    case "no_content":
      return "This presentation has no slides to convert. It may be damaged — try re-saving it from the app that created it.";
    case "unavailable":
      return "The converter is temporarily unavailable. Please try again in a few minutes.";
    case "timeout":
      return "This presentation took too long to convert. Very long or image-heavy decks can exceed the time limit — try splitting it into smaller files.";
    case "rate_limited":
      return "You've converted several files just now. Please wait a minute and try again.";
    default:
      return "Could not convert this presentation. Please try again.";
  }
}

/**
 * Builds the output filename from the source.
 *
 * Strips any of the accepted extensions case-insensitively and falls back to a
 * generic name, so "Pitch.PPTX" downloads as "Pitch.pdf" rather than
 * "Pitch.PPTX.pdf" and a file with no extension still gets a sensible name.
 *
 * @param {string} sourceName
 * @returns {string}
 */
export function pdfFilename(sourceName) {
  const base = String(sourceName || "")
    .replace(/\.(pptx|ppt|ppsx|pps|odp)$/i, "")
    .trim();
  if (!base) return "converted.pdf";
  return `${base}.pdf`;
}

function formatLimit(bytes) {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}
