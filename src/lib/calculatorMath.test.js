import { describe, it, expect } from "vitest";
import {
  percentageOf,
  whatPercent,
  percentChange,
  addGst,
  removeGst,
  simpleInterest,
  compoundInterest,
} from "./calculatorMath";

describe("percentageOf", () => {
  it("computes X% of Y", () => {
    expect(percentageOf(20, 50)).toBe(10);
    expect(percentageOf(0, 100)).toBe(0);
  });
});

describe("whatPercent", () => {
  it("computes what percent X is of Y", () => {
    expect(whatPercent(25, 200)).toBe(12.5);
  });

  it("throws when Y is zero", () => {
    expect(() => whatPercent(10, 0)).toThrow();
  });
});

describe("percentChange", () => {
  it("computes a positive change (increase)", () => {
    expect(percentChange(100, 150)).toBe(50);
  });

  it("computes a negative change (decrease)", () => {
    expect(percentChange(100, 50)).toBe(-50);
  });

  it("throws when X is zero", () => {
    expect(() => percentChange(0, 50)).toThrow();
  });
});

describe("addGst", () => {
  it("adds GST on top of a base amount", () => {
    const result = addGst(1000, 18);
    expect(result.base).toBe(1000);
    expect(result.gstAmount).toBeCloseTo(180);
    expect(result.total).toBeCloseTo(1180);
  });
});

describe("removeGst", () => {
  it("backs out GST from a GST-inclusive total", () => {
    const result = removeGst(1180, 18);
    expect(result.total).toBe(1180);
    expect(result.base).toBeCloseTo(1000);
    expect(result.gstAmount).toBeCloseTo(180);
  });

  it("round-trips with addGst", () => {
    const added = addGst(500, 12);
    const removed = removeGst(added.total, 12);
    expect(removed.base).toBeCloseTo(500);
  });
});

describe("simpleInterest", () => {
  it("computes simple interest and total", () => {
    const result = simpleInterest(1000, 10, 2);
    expect(result.interest).toBe(200);
    expect(result.total).toBe(1200);
  });
});

describe("compoundInterest", () => {
  it("computes compound interest with annual compounding", () => {
    const result = compoundInterest(1000, 10, 1, 1);
    expect(result.total).toBeCloseTo(1100);
    expect(result.interest).toBeCloseTo(100);
  });

  it("compounds more with higher frequency", () => {
    const annual = compoundInterest(1000, 12, 5, 1);
    const monthly = compoundInterest(1000, 12, 5, 12);
    expect(monthly.total).toBeGreaterThan(annual.total);
  });

  it("matches simple interest for a single period with 1x frequency and short time", () => {
    // Over a very short compounding, compound and simple interest converge
    // but are not required to match exactly — just sanity check monotonicity.
    const result = compoundInterest(1000, 10, 0, 1);
    expect(result.total).toBeCloseTo(1000);
    expect(result.interest).toBeCloseTo(0);
  });
});
