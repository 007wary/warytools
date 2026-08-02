import { describe, it, expect } from "vitest";
import { parseDateInput, diffBetween } from "./dateMath";

describe("parseDateInput", () => {
  it("parses YYYY-MM-DD as a local date, not UTC", () => {
    const date = parseDateInput("2024-03-15");
    expect(date.getFullYear()).toBe(2024);
    expect(date.getMonth()).toBe(2); // 0-indexed
    expect(date.getDate()).toBe(15);
  });
});

describe("diffBetween", () => {
  it("computes years/months/days for a simple forward range", () => {
    const result = diffBetween(parseDateInput("2020-01-01"), parseDateInput("2024-03-15"));
    expect(result).toEqual({ years: 4, months: 2, days: 14, totalDays: expect.any(Number) });
  });

  it("borrows a month when the end day is earlier than the start day", () => {
    // Jan 31 -> Mar 1 is 1 month 1 day, not 2 months -30 days.
    const result = diffBetween(parseDateInput("2024-01-31"), parseDateInput("2024-03-01"));
    expect(result.years).toBe(0);
    expect(result.months).toBe(1);
    expect(result.days).toBe(1);
  });

  it("never returns a negative day count when the start day doesn't exist in the target month", () => {
    // Regression test: stepping Jan 31 forward by a month lands on a date
    // that doesn't exist in February, which used to make the day count
    // go negative (e.g. "1 month, -1 days") instead of clamping.
    expect(diffBetween(parseDateInput("2024-01-31"), parseDateInput("2024-03-01")).days).toBeGreaterThanOrEqual(0);
    expect(diffBetween(parseDateInput("2024-05-31"), parseDateInput("2024-07-01")).days).toBeGreaterThanOrEqual(0);
    expect(diffBetween(parseDateInput("2023-01-31"), parseDateInput("2023-02-28")).days).toBeGreaterThanOrEqual(0);
  });

  it("lands exactly on a month boundary when the end day matches the last day of that month", () => {
    // Jan 31 -> Feb 28 (non-leap year) is exactly 1 month, 0 days.
    const result = diffBetween(parseDateInput("2023-01-31"), parseDateInput("2023-02-28"));
    expect(result.months).toBe(1);
    expect(result.days).toBe(0);
  });

  it("borrows a year when the end month is earlier than the start month", () => {
    const result = diffBetween(parseDateInput("2020-06-01"), parseDateInput("2024-01-01"));
    expect(result.years).toBe(3);
    expect(result.months).toBe(7);
  });

  it("is order-independent — swaps start/end if start is after end", () => {
    const forward = diffBetween(parseDateInput("2024-01-01"), parseDateInput("2024-06-15"));
    const backward = diffBetween(parseDateInput("2024-06-15"), parseDateInput("2024-01-01"));
    expect(backward).toEqual(forward);
  });

  it("returns zeros for the same date", () => {
    const result = diffBetween(parseDateInput("2024-01-01"), parseDateInput("2024-01-01"));
    expect(result).toEqual({ years: 0, months: 0, days: 0, totalDays: 0 });
  });

  it("handles leap-year February correctly when borrowing days", () => {
    // Feb 29 2024 -> Mar 1 2024 is 1 day, and the borrow (if end day < start
    // day) must use the leap-year day count for February.
    const result = diffBetween(parseDateInput("2024-02-15"), parseDateInput("2024-03-01"));
    expect(result.months).toBe(0);
    expect(result.days).toBe(15);
  });

  it("computes totalDays as a flat day count regardless of calendar borrowing", () => {
    const result = diffBetween(parseDateInput("2024-01-01"), parseDateInput("2024-01-31"));
    expect(result.totalDays).toBe(30);
  });
});
