import { describe, it, expect } from "vitest";
import {
  ops,
  replies,
  createRequest,
  createProgress,
  createChunk,
  formatProgress,
  isProgressiveOp,
} from "./pdfWorkerProtocol";

describe("createRequest", () => {
  it("builds an envelope carrying the id, op and payload", () => {
    expect(createRequest("req-1", ops.MERGE, { files: [] })).toEqual({
      id: "req-1",
      op: "merge",
      payload: { files: [] },
    });
  });

  it("defaults the payload so a no-argument op needn't pass one", () => {
    expect(createRequest("req-1", ops.COMPRESS).payload).toEqual({});
  });

  // An id is what routes a reply back to the caller that asked for it. A
  // user who re-selects a file mid-run has two operations in flight, and an
  // unidentified reply would resolve whichever promise happened to be
  // waiting — handing back the wrong document.
  it("refuses a request with no id", () => {
    expect(() => createRequest("", ops.MERGE)).toThrow(/needs an id/);
  });

  it("refuses an unknown op rather than posting it and hanging", () => {
    expect(() => createRequest("req-1", "delete_everything")).toThrow(/Unknown PDF worker op/);
  });
});

describe("createProgress", () => {
  it("computes the completion ratio", () => {
    const progress = createProgress("req-1", 3, 10, "Merging file");
    expect(progress.type).toBe(replies.PROGRESS);
    expect(progress.ratio).toBeCloseTo(0.3);
    expect(progress.completed).toBe(3);
    expect(progress.total).toBe(10);
  });

  // A NaN ratio renders as `width: NaN%`, which silently drops the style and
  // leaves an empty track that looks like a stalled job.
  it("clamps a zero total to a 0 ratio instead of dividing by zero", () => {
    expect(createProgress("req-1", 5, 0).ratio).toBe(0);
  });

  it("never reports more than complete", () => {
    expect(createProgress("req-1", 15, 10).ratio).toBe(1);
  });

  it("treats negative and non-finite counts as zero", () => {
    expect(createProgress("req-1", -5, 10).completed).toBe(0);
    expect(createProgress("req-1", NaN, 10).completed).toBe(0);
    expect(createProgress("req-1", 5, NaN).ratio).toBe(0);
  });
});

describe("createChunk", () => {
  it("carries the request id, the position and the payload", () => {
    const chunk = createChunk("req-1", 0, { name: "page-1.pdf", bytes: new ArrayBuffer(8) });

    expect(chunk.type).toBe(replies.CHUNK);
    expect(chunk.id).toBe("req-1");
    expect(chunk.index).toBe(0);
    expect(chunk.name).toBe("page-1.pdf");
    expect(chunk.bytes.byteLength).toBe(8);
  });

  // A chunk is one item of many, so it must be distinguishable from the RESULT
  // that ends the request. The client keys on exactly this: a CHUNK leaves the
  // promise pending, anything else settles it. If these two ever shared a type
  // the first page of a split would resolve the whole operation and the
  // remaining pages would arrive with nothing listening.
  it("is not confusable with a result", () => {
    expect(replies.CHUNK).not.toBe(replies.RESULT);
    expect(createChunk("req-1", 0).type).not.toBe(replies.RESULT);
  });

  it("defaults its payload so an index-only chunk is still well formed", () => {
    expect(createChunk("req-1", 3)).toEqual({
      type: replies.CHUNK,
      id: "req-1",
      index: 3,
    });
  });
});

describe("formatProgress", () => {
  it("reads as a count of real work units", () => {
    expect(formatProgress(createProgress("r", 3, 10, "Splitting page"))).toBe(
      "Splitting page 3 of 10"
    );
  });

  it("falls back to a generic label when the total is unknown", () => {
    expect(formatProgress(createProgress("r", 0, 0))).toBe("Working…");
  });

  it("handles a missing progress object", () => {
    expect(formatProgress(null)).toBe("");
  });
});

describe("isProgressiveOp", () => {
  // Only the ops that loop over pages or files can report meaningful
  // progress. A bar on a single-shot op would show 0% and vanish.
  it("is true for the looping operations", () => {
    expect(isProgressiveOp(ops.MERGE)).toBe(true);
    expect(isProgressiveOp(ops.SPLIT_ALL)).toBe(true);
    // Building a PDF from images embeds and lays out one file at a time, and
    // a twenty-photo batch is slow enough that silence reads as a hang.
    expect(isProgressiveOp(ops.IMAGES_TO_PDF)).toBe(true);
  });

  it("is false for single-shot operations", () => {
    expect(isProgressiveOp(ops.COMPRESS)).toBe(false);
    expect(isProgressiveOp(ops.ROTATE)).toBe(false);
    expect(isProgressiveOp(ops.INSPECT)).toBe(false);
    // Crop touches every page but only writes box metadata, so the loop
    // finishes faster than a bar could render and one would just flash.
    expect(isProgressiveOp(ops.CROP)).toBe(false);
    // Same reasoning for page numbers: drawText on an already-parsed page is
    // cheap, and the cost is dominated by the single save at the end, which no
    // per-page bar can describe anyway.
    expect(isProgressiveOp(ops.ADD_PAGE_NUMBERS)).toBe(false);
  });
});

describe("the new tool ops", () => {
  // These go through createRequest like everything else, so an op missing from
  // the registry would throw at post time rather than hanging on a reply that
  // never comes.
  it("are accepted by createRequest", () => {
    expect(createRequest("req-1", ops.IMAGES_TO_PDF, { images: [] }).op).toBe("images_to_pdf");
    expect(createRequest("req-1", ops.CROP, { rects: {} }).op).toBe("crop");
    expect(createRequest("req-1", ops.ADD_PAGE_NUMBERS, { plan: [] }).op).toBe("add_page_numbers");
  });

  it("have distinct values, so no two ops collide in the worker's switch", () => {
    const values = Object.values(ops);
    expect(new Set(values).size).toBe(values.length);
  });
});
