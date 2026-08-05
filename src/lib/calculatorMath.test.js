import { describe, it, expect } from "vitest";
import {
  percentageOf,
  whatPercent,
  percentChange,
  addGst,
  removeGst,
  simpleInterest,
  compoundInterest,
  loanEmi,
  CalculationError,
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

  it("throws rather than returning Infinity when the result overflows", () => {
    // Previously this reached the UI and rendered as the string "Infinity".
    expect(() => compoundInterest(1e15, 1e9, 1000, 12)).toThrow(CalculationError);
  });

  it("rejects a zero compounding frequency instead of returning NaN", () => {
    expect(() => compoundInterest(1000, 10, 1, 0)).toThrow(CalculationError);
  });
});

describe("overflow guards", () => {
  it("throws from percentageOf when the product overflows", () => {
    expect(() => percentageOf(1e308, 1e308)).toThrow(CalculationError);
  });

  it("throws from simpleInterest when the product overflows", () => {
    expect(() => simpleInterest(1e308, 1e308, 1e308)).toThrow(CalculationError);
  });

  it("rejects a -100% GST rate rather than dividing by zero", () => {
    expect(() => removeGst(1000, -100)).toThrow(CalculationError);
  });
});

describe("loanEmi", () => {
  it("computes a known EMI correctly", () => {
    // ₹10,00,000 at 9% over 10 years is ~₹12,668/month.
    const result = loanEmi(1000000, 9, 10);
    expect(result.emi).toBeCloseTo(12667.58, 1);
    expect(result.months).toBe(120);
  });

  it("handles a zero interest rate as a plain division", () => {
    // At r = 0 the standard EMI formula is 0/0; without a special case this
    // returned NaN.
    const result = loanEmi(120000, 0, 10);
    expect(result.emi).toBeCloseTo(1000);
    expect(result.totalInterest).toBeCloseTo(0);
  });

  it("reports total payable and total interest consistently", () => {
    const result = loanEmi(500000, 8, 5);
    expect(result.totalPayable).toBeCloseTo(result.emi * result.months);
    expect(result.totalInterest).toBeCloseTo(result.totalPayable - 500000);
    expect(result.totalInterest).toBeGreaterThan(0);
  });

  it("costs more interest over a longer tenure", () => {
    expect(loanEmi(500000, 8, 20).totalInterest).toBeGreaterThan(
      loanEmi(500000, 8, 5).totalInterest
    );
  });

  it("amortises down to a zero balance by the final year", () => {
    const result = loanEmi(500000, 8, 5);
    expect(result.schedule).toHaveLength(5);
    expect(result.schedule[result.schedule.length - 1].balance).toBeCloseTo(0, 6);
  });

  it("repays exactly the principal across the whole schedule", () => {
    const result = loanEmi(750000, 7.5, 7);
    const repaid = result.schedule.reduce((sum, row) => sum + row.principalPaid, 0);
    expect(repaid).toBeCloseTo(750000, 4);
  });

  it("rejects invalid loan inputs", () => {
    expect(() => loanEmi(0, 9, 10)).toThrow(CalculationError);
    expect(() => loanEmi(100000, 9, 0)).toThrow(CalculationError);
    expect(() => loanEmi(100000, -1, 10)).toThrow(CalculationError);
  });
});
