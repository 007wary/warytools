// Eviction policy for the PDF page-thumbnail cache.
//
// usePdfThumbnails renders page bitmaps on demand and holds each as an object
// URL. Without a bound, that Map only ever grows: the six tools that render a
// scrollable page grid (delete-pages, extract-pages, reorder, rotate, and the
// single-preview crop/sign/watermark/page-numbers pair) let a user scroll the
// whole document, so a 300-page PDF ends up pinning 300 WebP blobs and their
// URLs for as long as the file is loaded. That is the exact leak the hook's
// header comment claims to prevent — the comment described the intended design
// and this half of it was never written.
//
// The policy is least-recently-USED rather than least-recently-added, and the
// distinction is the whole point. Thumbnail access is driven by scrolling, which
// revisits pages constantly: a user who scrolls to page 200 and back to page 1
// must not find page 1 evicted merely because it was rendered first. Insertion
// order would do exactly that and make the cache useless on the access pattern
// it exists to serve.
//
// This lives here rather than inline in the hook for the reason CLAUDE.md gives
// for pdfPageRange.js: there are no component tests, so logic embedded in a
// client component cannot be tested at all. Getting eviction wrong fails
// silently — an over-eager policy re-renders pages endlessly (slow, but it still
// looks correct), and a policy that never evicts is the leak itself. Neither
// throws, so only a test catches either.

/**
 * How many rendered thumbnails stay resident.
 *
 * Sized against the worst case the grid tools actually produce: a ~150px cell
 * at 2x on a large desktop viewport shows roughly 40 thumbnails, and
 * useNearViewport's 400px root margin renders a little beyond that. 120 leaves
 * several screens of headroom in both scroll directions, so ordinary scrolling
 * never evicts a page it is about to ask for again, while bounding a 300-page
 * document to well under half its thumbnails.
 *
 * Each entry is a WebP blob of a ~300px-wide page render — tens of KB, not the
 * megabytes a full-page bitmap would be. The cap is about bounding unbounded
 * growth, not about being frugal, so it is set generously enough that the
 * common case never notices it.
 */
export const MAX_RESIDENT_THUMBNAILS = 120;

/**
 * Decides which pages to evict after recording an access.
 *
 * Pure and Map-free so it can be tested without a DOM: the caller owns the Map
 * and the object URLs, this only decides *what* goes. Returns the page numbers
 * to drop, in eviction order (least recently used first).
 *
 * `order` is the caller's access log — page numbers, oldest first, at most one
 * entry per page. It is returned updated rather than mutated, so a caller
 * holding it in a ref replaces the value instead of relying on aliasing.
 *
 * @param {number[]} order Access log, least-recently-used first.
 * @param {number} pageNumber The page just rendered or read.
 * @param {number} [limit] Maximum resident entries.
 * @returns {{order: number[], evict: number[]}}
 */
export function touchThumbnail(order, pageNumber, limit = MAX_RESIDENT_THUMBNAILS) {
  const log = Array.isArray(order) ? order : [];

  if (!Number.isInteger(pageNumber) || pageNumber < 1) {
    return { order: log, evict: [] };
  }

  // Moved to the most-recent end rather than appended blindly. Without the
  // filter a page re-read on every scroll frame would occupy the log many times
  // over, and its duplicate stale entries would then push genuinely older pages
  // out early — the log would stop describing recency at all.
  const next = log.filter((page) => page !== pageNumber);
  next.push(pageNumber);

  // A non-positive limit would otherwise evict the entry that was just
  // rendered, so the caller would revoke a URL it is about to return and hand
  // out a dead blob: URL. Treated as "no bound" instead, which is the safe
  // reading of a misconfigured cap.
  if (!Number.isInteger(limit) || limit < 1 || next.length <= limit) {
    return { order: next, evict: [] };
  }

  const overflow = next.length - limit;
  return { order: next.slice(overflow), evict: next.slice(0, overflow) };
}
