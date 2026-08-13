import { describe, expect, it } from "vitest";
import { MAX_RESIDENT_THUMBNAILS, touchThumbnail } from "./thumbnailCache";

// The eviction policy behind usePdfThumbnails' resident-bitmap cap.
//
// Every failure mode here is silent, which is why the coverage is this heavy: a
// cache that never evicts is the leak this module exists to close, and one that
// evicts the wrong entry just re-renders pages forever and still looks correct
// on screen. Neither throws.

/** Replays a sequence of accesses, returning the final log and everything evicted. */
function replay(pages, limit) {
  let order = [];
  const evicted = [];

  for (const page of pages) {
    const result = touchThumbnail(order, page, limit);
    order = result.order;
    evicted.push(...result.evict);
  }

  return { order, evicted };
}

describe("touchThumbnail", () => {
  it("records an access", () => {
    expect(touchThumbnail([], 1)).toEqual({ order: [1], evict: [] });
  });

  it("evicts nothing while under the limit", () => {
    const { order, evicted } = replay([1, 2, 3], 5);
    expect(order).toEqual([1, 2, 3]);
    expect(evicted).toEqual([]);
  });

  it("evicts nothing at exactly the limit", () => {
    // The boundary an off-by-one lands on: at capacity nothing has overflowed
    // yet, so evicting here would drop a page that is still legitimately held.
    const { order, evicted } = replay([1, 2, 3], 3);
    expect(order).toEqual([1, 2, 3]);
    expect(evicted).toEqual([]);
  });

  it("evicts the least recently used once over the limit", () => {
    const { order, evicted } = replay([1, 2, 3, 4], 3);
    expect(evicted).toEqual([1]);
    expect(order).toEqual([2, 3, 4]);
  });

  it("never evicts the page just accessed", () => {
    // The sharp edge: the caller returns this page's URL immediately after
    // touching it, so evicting it would revoke a blob: URL that is about to be
    // handed to an <img> — a thumbnail that silently fails to load.
    const { order, evicted } = replay([1, 2, 3, 4, 5], 1);
    expect(evicted).not.toContain(5);
    expect(order).toEqual([5]);
  });

  describe("recency, not insertion order", () => {
    it("spares a re-read page and evicts the genuinely oldest", () => {
      // The access pattern this whole module exists for: scroll down, scroll
      // back. Page 1 is read again before the cap is hit, so page 2 is now the
      // oldest. An insertion-ordered bound would evict page 1 — the page the
      // user is looking at.
      const { order, evicted } = replay([1, 2, 3, 1, 4], 3);
      expect(evicted).toEqual([2]);
      expect(order).toEqual([3, 1, 4]);
    });

    it("keeps a page held on screen alive indefinitely", () => {
      // A single-preview tool (crop, sign) re-reads one page on every render
      // while the user scrubs settings. That page must never age out.
      let order = [];
      for (let i = 0; i < 50; i++) {
        order = touchThumbnail(order, 7, 3).order;
        order = touchThumbnail(order, i + 100, 3).order;
      }
      expect(order).toContain(7);
    });

    it("does not let a repeated page occupy the log twice", () => {
      // Duplicates would make the log stop describing recency: stale copies of
      // one page would push genuinely older pages out ahead of their time.
      const { order } = replay([1, 1, 1, 2], 10);
      expect(order).toEqual([1, 2]);
    });
  });

  it("evicts multiple entries when the log starts over the limit", () => {
    // Reachable if the cap is ever lowered while entries are resident.
    const { order, evict } = touchThumbnail([1, 2, 3, 4, 5], 6, 2);
    expect(evict).toEqual([1, 2, 3, 4]);
    expect(order).toEqual([5, 6]);
  });

  it("returns a new array rather than mutating the log", () => {
    // The caller holds this in a ref and replaces the value; mutating in place
    // would make the returned log and the ref the same object, so a future
    // change here could alias in ways the caller cannot see.
    const original = [1, 2];
    const { order } = touchThumbnail(original, 3, 10);
    expect(original).toEqual([1, 2]);
    expect(order).not.toBe(original);
  });

  describe("hostile and degenerate input", () => {
    it("ignores a non-integer page number", () => {
      for (const bad of [null, undefined, "3", 1.5, NaN, Infinity, -1, 0]) {
        expect(touchThumbnail([1, 2], bad, 10)).toEqual({ order: [1, 2], evict: [] });
      }
    });

    it("tolerates a missing log", () => {
      expect(touchThumbnail(undefined, 1)).toEqual({ order: [1], evict: [] });
      expect(touchThumbnail(null, 1)).toEqual({ order: [1], evict: [] });
    });

    it("treats a nonsensical limit as unbounded rather than evicting the new page", () => {
      // Number.isInteger, never a truthiness check: a limit of 0 must not read
      // as "no limit" by accident, and must not evict the page just rendered
      // either. Both readings are wrong in different directions, so the safe
      // one is chosen explicitly.
      for (const bad of [0, -1, 1.5, NaN, undefined, "5"]) {
        const { order, evict } = touchThumbnail([1, 2, 3], 4, bad);
        expect(evict).toEqual([]);
        expect(order).toEqual([1, 2, 3, 4]);
      }
    });
  });

  it("bounds a full document scroll to the cap", () => {
    // The end-to-end property: reading every page of a 300-page document leaves
    // the cap resident, not 300. This is the leak, stated as a test.
    const pages = Array.from({ length: 300 }, (_, i) => i + 1);
    const { order, evicted } = replay(pages);

    expect(order).toHaveLength(MAX_RESIDENT_THUMBNAILS);
    expect(evicted).toHaveLength(300 - MAX_RESIDENT_THUMBNAILS);
    // What survives is the most recent window, and every evicted page is
    // distinct — a page must never be revoked twice.
    expect(order[order.length - 1]).toBe(300);
    expect(new Set(evicted).size).toBe(evicted.length);
  });
});
