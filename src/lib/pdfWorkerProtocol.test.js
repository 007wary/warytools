import { describe, it, expect } from "vitest";
import {
  ops,
  replies,
  createRequest,
  createProgress,
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
  });
});

describe("the new tool ops", () => {
  // These go through createRequest like everything else, so an op missing from
  // the registry would throw at post time rather than hanging on a reply that
  // never comes.
  it("are accepted by createRequest", () => {
    expect(createRequest("req-1", ops.IMAGES_TO_PDF, { images: [] }).op).toBe("images_to_pdf");
    expect(createRequest("req-1", ops.CROP, { rects: {} }).op).toBe("crop");
  });

  it("have distinct values, so no two ops collide in the worker's switch", () => {
    const values = Object.values(ops);
    expect(new Set(values).size).toBe(values.length);
  });
});
