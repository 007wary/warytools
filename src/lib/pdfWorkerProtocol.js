// The message contract between the PDF tools and src/workers/pdf.worker.js.
//
// Kept in its own dependency-free module for two reasons. First, both sides of
// a worker boundary have to agree on the shape of every message, and a shared
// module is the only way to keep that agreement checkable rather than
// duplicated by hand. Second, it means the protocol can be unit-tested in
// node — the worker itself can't be, since vitest runs without a DOM or
// Worker global (see vitest.config.js `environment: "node"`).

/** Operations the worker knows how to run. */
export const ops = {
  MERGE: "merge",
  EXTRACT_RANGE: "extract_range",
  SPLIT_ALL: "split_all",
  COMPRESS: "compress",
  REORDER: "reorder",
  ROTATE: "rotate",
  INSPECT: "inspect",
  IMAGES_TO_PDF: "images_to_pdf",
  CROP: "crop",
  ADD_PAGE_NUMBERS: "add_page_numbers",
  WATERMARK: "watermark",
};

/** Message kinds the worker sends back. */
export const replies = {
  PROGRESS: "progress",
  RESULT: "result",
  ERROR: "error",
};

/**
 * Builds a request envelope.
 *
 * Every request carries an `id` so replies can be routed back to the right
 * caller: a user who re-selects a file mid-run has two operations in flight,
 * and without an id the first one's result would resolve the second one's
 * promise and hand back the wrong document.
 *
 * @param {string} id   Unique per request.
 * @param {string} op   One of {@link ops}.
 * @param {object} payload Operation-specific data.
 */
export function createRequest(id, op, payload = {}) {
  if (!id) throw new Error("A worker request needs an id.");
  if (!Object.values(ops).includes(op)) throw new Error(`Unknown PDF worker op: ${op}`);
  return { id, op, payload };
}

/**
 * Normalises a progress update.
 *
 * `completed`/`total` are the honest units of work (usually pages). The ratio
 * is clamped because a malformed total (0, negative, NaN) must not produce a
 * progress bar that renders past its track or throws on a NaN width.
 *
 * @returns {{type: string, id: string, completed: number, total: number, ratio: number, label: string}}
 */
export function createProgress(id, completed, total, label = "") {
  const safeTotal = Number.isFinite(total) && total > 0 ? total : 0;
  const safeCompleted = Number.isFinite(completed) && completed > 0 ? completed : 0;
  const ratio = safeTotal === 0 ? 0 : Math.min(1, safeCompleted / safeTotal);

  return {
    type: replies.PROGRESS,
    id,
    completed: safeCompleted,
    total: safeTotal,
    ratio,
    label,
  };
}

/**
 * Formats a progress update as UI text.
 *
 * @param {{completed: number, total: number, label: string}} progress
 */
export function formatProgress(progress) {
  if (!progress) return "";
  const { completed, total, label } = progress;
  if (!total) return label || "Working…";
  return `${label || "Processing"} ${completed} of ${total}`;
}

/**
 * True when a request should report per-item progress.
 *
 * Single-shot operations finish in one step, so a progress bar for them would
 * only ever show 0% then vanish — noise, not information. Only the loops over
 * pages or files get one.
 */
export function isProgressiveOp(op) {
  // Crop is excluded deliberately even though it touches every page: setting a
  // box is a cheap metadata write, so the whole loop finishes faster than a
  // progress bar could render, and showing one would only flash.
  //
  // Watermark is included for the opposite reason: a tiled mark is up to a few
  // hundred real draw operations *per page*, so a long document spends seconds
  // in that loop and the user needs to see it moving.
  return (
    op === ops.MERGE ||
    op === ops.SPLIT_ALL ||
    op === ops.IMAGES_TO_PDF ||
    op === ops.WATERMARK
  );
}
