import { describe, it, expect } from "vitest";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  formatCount,
  formatResultForCopy,
} from "./calculatorFormat";

describe("formatCurrency", () => {
  it("uses ₹ with Indian lakh/crore grouping", () => {
    // The old toFixed(2) path rendered this as the bare string "1234567.89".
    expect(formatCurrency(1234567.89)).toBe("₹12,34,567.89");
  });

  it("always shows two decimals", () => {
    expect(formatCurrency(1180)).toBe("₹1,180.00");
  });

  it("renders a dash rather than 'Infinity' or 'NaN' for non-finite input", () => {
    expect(formatCurrency(Infinity)).toBe("—");
    expect(formatCurrency(NaN)).toBe("—");
  });
});

describe("formatNumber", () => {
  it("hides floating-point artifacts from chained conversion factors", () => {
    // 3 miles -> km previously surfaced as "4.828032000000001".
    expect(formatNumber(4.828032000000001)).toBe("4.828032");
  });

  it("does not flatten a small but real value to zero", () => {
    // The converter's old maximumFractionDigits: 6 rendered this as "0".
    expect(formatNumber(0.0000001)).not.toBe("0");
    expect(formatNumber(0.0000001)).toContain("1");
  });

  it("falls back to exponential notation for extremely small values", () => {
    expect(formatNumber(1e-12)).toMatch(/e-12$/);
  });

  it("formats an exact zero as '0'", () => {
    expect(formatNumber(0)).toBe("0");
  });

  it("returns a dash for non-finite input", () => {
    expect(formatNumber(Infinity)).toBe("—");
    expect(formatNumber(NaN)).toBe("—");
  });

  it("respects an explicit maximumFractionDigits", () => {
    expect(formatNumber(1.23456, { maximumFractionDigits: 2 })).toBe("1.23");
  });
});

describe("formatPercent", () => {
  it("appends a percent sign and rounds to two decimals by default", () => {
    expect(formatPercent(12.3456)).toBe("12.35%");
    expect(formatPercent(50)).toBe("50%");
  });

  it("returns a dash for non-finite input", () => {
    expect(formatPercent(Infinity)).toBe("—");
  });
});

describe("formatCount", () => {
  it("formats a whole number with grouping and no decimals", () => {
    expect(formatCount(124500.7)).not.toContain(".");
    expect(formatCount(124500)).toMatch(/^1[,.]?2?4?,?500$/);
  });

  it("returns a dash for non-finite input", () => {
    expect(formatCount(NaN)).toBe("—");
  });
});

describe("formatResultForCopy", () => {
  it("renders one 'label: value' per line", () => {
    expect(
      formatResultForCopy([
        { label: "Base amount", value: "₹1,000.00" },
        { label: "Total", value: "₹1,180.00" },
      ])
    ).toBe("Base amount: ₹1,000.00\nTotal: ₹1,180.00");
  });

  it("skips empty rows", () => {
    expect(formatResultForCopy([null, { label: "A", value: "1" }])).toBe("A: 1");
  });
});
