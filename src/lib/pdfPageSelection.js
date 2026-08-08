// Set arithmetic shared by Delete Pages and Extract Pages.
//
// Both tools are the same operation seen from opposite ends: the user names a
// set of pages, and one tool keeps them while the other keeps everything else.
// Putting the arithmetic here rather than in either client means the two can't
// disagree about what "pages 3-5 of a 10-page document" resolves to, and — per
// CLAUDE.md — it's the only way any of it gets test coverage, since there are
// no component tests.
//
// Everything here works in **1-based page numbers**, matching what the user
// types and what the UI shows. The conversion to 0-based indices happens once,
// at the worker boundary, in toPageIndices(). Mixing the two conventions
// mid-pipeline is the classic off-by-one in this kind of tool, and it fails
// silently: you get a real PDF back, just with the wrong page missing.

import { parsePageSelection, formatPageSelection } from "./pdfPageRange";

/**
 * Every page from 1 to pageCount that isn't in `selected`.
 *
 * This is what Delete Pages actually exports — there is no "delete" operation
 * in the PDF worker, and there shouldn't be: deleting page 4 and keeping
 * pages 1,2,3,5,6 are the same document, so the existing EXTRACT_RANGE op
 * serves both tools and neither needs new worker code.
 *
 * Ascending order is guaranteed regardless of the order pages were selected
 * in. A deletion has no meaningful ordering — the pages that survive keep the
 * order they had in the source document — so a Set-driven UI where the user
 * clicked page 7 before page 2 must not silently reverse the output.
 *
 * @param {Iterable<number>} selected 1-based page numbers to remove.
 * @param {number} pageCount Total pages in the source document.
 * @returns {number[]} 1-based page numbers to keep, ascending.
 */
export function invertSelection(selected, pageCount) {
  if (!Number.isInteger(pageCount) || pageCount < 1) return [];

  const removed = new Set();
  for (const page of selected || []) {
    if (Number.isInteger(page)) removed.add(page);
  }

  const kept = [];
  for (let page = 1; page <= pageCount; page++) {
    if (!removed.has(page)) kept.push(page);
  }
  return kept;
}

/**
 * Deduplicates and sorts a selection into ascending page order.
 *
 * Used by Delete Pages, where the selection is a set of pages to *remove* and
 * repetition is meaningless — unlike Extract Pages, which deliberately honours
 * both order and duplicates (see parsePageSelection: "3,1,3" is a real
 * request for three pages in that order).
 *
 * @param {Iterable<number>} pages
 * @param {number} pageCount
 * @returns {number[]}
 */
export function normalizeSelection(pages, pageCount) {
  if (!Number.isInteger(pageCount) || pageCount < 1) return [];

  const seen = new Set();
  for (const page of pages || []) {
    if (Number.isInteger(page) && page >= 1 && page <= pageCount) seen.add(page);
  }
  return [...seen].sort((a, b) => a - b);
}

/**
 * Validates a deletion before it runs.
 *
 * Two refusals, and both are about handing back a file that is worse than no
 * file. Deleting every page produces a zero-page PDF, which pdf-lib will
 * happily write and most readers refuse to open — the user gets a download
 * that looks like success and turns out to be a broken document, which is the
 * class of silent failure this codebase designs against. An empty selection is
 * refused because saving an unchanged copy under a "pages removed" name
 * invites someone to believe a deletion happened.
 *
 * @param {number[]} selected 1-based page numbers marked for removal.
 * @param {number} pageCount
 * @returns {{ok: true, keep: number[], removed: number[]} | {ok: false, error: string}}
 */
export function validateDeletion(selected, pageCount) {
  if (!Number.isInteger(pageCount) || pageCount < 1) {
    return { ok: false, error: "Load a PDF before choosing pages." };
  }

  const removed = normalizeSelection(selected, pageCount);

  if (removed.length === 0) {
    return { ok: false, error: "Select at least one page to delete." };
  }

  if (removed.length >= pageCount) {
    return {
      ok: false,
      error: "You can't delete every page — a PDF needs at least one page. Leave one behind.",
    };
  }

  return { ok: true, keep: invertSelection(removed, pageCount), removed };
}

/**
 * Validates an extraction before it runs.
 *
 * Only the empty case is refused: extracting every page is a legitimate (if
 * redundant) request, and the tool has no business second-guessing it.
 *
 * @param {number[]} selected 1-based page numbers to pull out, in the order wanted.
 * @param {number} pageCount
 * @returns {{ok: true, pages: number[]} | {ok: false, error: string}}
 */
export function validateExtraction(selected, pageCount) {
  if (!Number.isInteger(pageCount) || pageCount < 1) {
    return { ok: false, error: "Load a PDF before choosing pages." };
  }

  const pages = (selected || []).filter(
    (page) => Number.isInteger(page) && page >= 1 && page <= pageCount
  );

  if (pages.length === 0) {
    return { ok: false, error: "Select at least one page to extract." };
  }

  return { ok: true, pages };
}

/**
 * Converts 1-based page numbers to the 0-based indices some worker ops expect.
 *
 * Note that EXTRACT_RANGE — the op both these tools use — takes 1-based page
 * numbers and converts internally, so neither client calls this. It's here for
 * the index-taking ops (REORDER) and, more usefully, as the one named place
 * the conversion is allowed to happen: an off-by-one in this pipeline returns
 * a perfectly valid PDF with the wrong page missing, which nothing downstream
 * can detect. Applying it on top of an op that already converts is exactly
 * that bug, so it stays a single tested function rather than an inline `- 1`
 * somebody adds twice.
 *
 * @param {number[]} pages
 * @returns {number[]}
 */
export function toPageIndices(pages) {
  return (pages || []).map((page) => page - 1);
}

/**
 * Turns typed range text into a selection Set for the thumbnail grid.
 *
 * The text box and the click-to-select grid are two views of one selection,
 * and this is the direction that keeps them in sync when the user types. It
 * reuses parsePageSelection so the syntax is identical to Split PDF's — people
 * shouldn't have to learn a second range grammar on a sibling tool.
 *
 * Order and duplicates are dropped here because a Set can't carry them; the
 * callers that need order (Extract) read the parsed array, not the Set.
 *
 * @param {string} text Raw range text, e.g. "1-3, 7".
 * @param {number} pageCount
 * @returns {{ok: true, pages: number[], set: Set<number>} | {ok: false, error: string}}
 */
export function parseSelectionText(text, pageCount) {
  const parsed = parsePageSelection(text, pageCount);
  if (!parsed.ok) return parsed;
  return { ok: true, pages: parsed.pages, set: new Set(parsed.pages) };
}

/**
 * Applies one click on the page grid to the current selection.
 *
 * Lives here rather than in the client for the usual reason — it's the logic a
 * user's clicks flow through, so it needs to be testable — but also because
 * both tools need it and shift-click is subtler than it looks.
 *
 * A plain click toggles one page. A shift-click selects the whole run between
 * the previous click and this one, and **only ever adds**: the convention every
 * file manager follows is that shift extends a selection, so making it toggle
 * would let a shift-click across a partly-selected range punch holes in it
 * rather than filling it, which is never what the gesture means.
 *
 * @param {Set<number>} current   The existing selection.
 * @param {number} pageNumber     The page clicked, 1-based.
 * @param {{shiftKey?: boolean, anchor?: number|null}} modifiers
 * @param {number} pageCount
 * @returns {Set<number>} A new Set — never the one passed in, so React sees a change.
 */
export function applyPageClick(current, pageNumber, modifiers, pageCount) {
  const next = new Set(current || []);

  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pageCount) {
    return next;
  }

  const anchor = modifiers?.anchor;
  const useRange =
    Boolean(modifiers?.shiftKey) &&
    Number.isInteger(anchor) &&
    anchor >= 1 &&
    anchor <= pageCount;

  if (useRange) {
    // Normalised so dragging the shift-click backwards (clicking page 9 then
    // shift-clicking page 3) selects the same run as the other direction.
    const start = Math.min(anchor, pageNumber);
    const end = Math.max(anchor, pageNumber);
    for (let page = start; page <= end; page++) next.add(page);
    return next;
  }

  if (next.has(pageNumber)) next.delete(pageNumber);
  else next.add(pageNumber);

  return next;
}

/**
 * Renders a selection as compact range text ("1-3, 7, 12-15").
 *
 * The opposite direction of parseSelectionText, so a click in the grid updates
 * the text box. Sorted first because formatPageSelection only collapses
 * consecutive ascending runs — handing it click order would render "2, 7, 3"
 * as three separate entries and make a contiguous selection look scattered.
 *
 * @param {Iterable<number>} pages
 * @param {number} pageCount
 * @returns {string}
 */
export function describeSelection(pages, pageCount) {
  return formatPageSelection(normalizeSelection(pages, pageCount));
}

/**
 * Builds the output filename for a run.
 *
 * The page list is deliberately NOT put in the name. It reads well for "1-3"
 * and becomes unusable at "1-3_7_12-15_22_30-41", and several filesystems and
 * mail clients truncate or reject long names — at which point the user has a
 * file they can't identify. The source name plus a verb is what someone
 * scanning a downloads folder actually needs.
 *
 * @param {string} sourceName Original file's name.
 * @param {string} suffix e.g. "pages-removed".
 * @returns {string}
 */
export function outputFilename(sourceName, suffix) {
  const base = String(sourceName || "document.pdf").replace(/\.pdf$/i, "");
  // Trimmed because a long source name plus the suffix can push past the
  // ~255-byte limit most filesystems enforce, and the browser's fallback for
  // an over-long download name is silent truncation to something arbitrary.
  const safe = (base.trim() || "document").slice(0, 80);
  return `${safe}-${suffix}.pdf`;
}
