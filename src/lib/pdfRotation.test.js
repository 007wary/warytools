import { describe, it, expect } from "vitest";
import { normalizePageRotation, addPageRotation, isQuarterTurned } from "./pdfRotation";

// The valid set. pdf-lib's setRotation asserts a multiple of 90 and nothing
// more, so anything outside this range is written to the file unchallenged.
const VALID = [0, 90, 180, 270];

describe("normalizePageRotation", () => {
  it("leaves the four canonical angles alone", () => {
    for (const angle of VALID) expect(normalizePageRotation(angle)).toBe(angle);
  });

  it("brings negative rotations into range", () => {
    // Scanner drivers write these. -90 is a landscape scan.
    expect(normalizePageRotation(-90)).toBe(270);
    expect(normalizePageRotation(-180)).toBe(180);
    expect(normalizePageRotation(-270)).toBe(90);
    expect(normalizePageRotation(-360)).toBe(0);
    expect(normalizePageRotation(-450)).toBe(270);
  });

  it("brings rotations at or above 360 into range", () => {
    expect(normalizePageRotation(360)).toBe(0);
    expect(normalizePageRotation(450)).toBe(90);
    expect(normalizePageRotation(720)).toBe(0);
  });

  it("rounds near-multiples rather than failing the document", () => {
    // A float round-trip in someone else's writer must not cost the user their
    // conversion — setRotation would throw on 89.9994.
    expect(normalizePageRotation(89.9994)).toBe(90);
    expect(normalizePageRotation(270.0001)).toBe(270);
  });

  it("treats a missing or non-finite rotation as upright", () => {
    expect(normalizePageRotation(undefined)).toBe(0);
    expect(normalizePageRotation(null)).toBe(0);
    expect(normalizePageRotation(NaN)).toBe(0);
  });
});

describe("addPageRotation", () => {
  it("adds a turn to an upright page", () => {
    expect(addPageRotation(0, 90)).toBe(90);
    expect(addPageRotation(90, 180)).toBe(270);
  });

  it("wraps past a full turn", () => {
    expect(addPageRotation(270, 90)).toBe(0);
    expect(addPageRotation(180, 270)).toBe(90);
  });

  // The regression this module exists for. `(current + extra) % 360` returns
  // -180 here, which setRotation accepts silently and readers disagree about.
  it("never returns a negative angle from a negatively-rotated page", () => {
    expect(addPageRotation(-270, 90)).toBe(180);
    expect(addPageRotation(-270, 180)).toBe(270);
    expect(addPageRotation(-90, 180)).toBe(90);
  });

  it("only ever produces one of the four valid angles", () => {
    // Exhaustive over every rotation a real file plausibly carries, crossed
    // with every turn the UI can request.
    for (let current = -720; current <= 720; current += 90) {
      for (const extra of VALID) {
        expect(VALID).toContain(addPageRotation(current, extra));
      }
    }
  });

  it("is a no-op for a zero turn, whatever the page carried", () => {
    expect(addPageRotation(-90, 0)).toBe(270);
    expect(addPageRotation(450, 0)).toBe(90);
  });
});

describe("isQuarterTurned", () => {
  it("reports the axis swap", () => {
    expect(isQuarterTurned(90)).toBe(true);
    expect(isQuarterTurned(270)).toBe(true);
    expect(isQuarterTurned(0)).toBe(false);
    expect(isQuarterTurned(180)).toBe(false);
  });

  it("normalises before deciding, so a negative page is judged correctly", () => {
    // -90 displays exactly as 270 does. Testing the raw value against 90/270
    // would call this upright and size every mark against the wrong axis.
    expect(isQuarterTurned(-90)).toBe(true);
    expect(isQuarterTurned(-270)).toBe(true);
    expect(isQuarterTurned(-180)).toBe(false);
    expect(isQuarterTurned(450)).toBe(true);
  });
});
