import { describe, it, expect } from "vitest";
import {
  parseDateInput,
  diffBetween,
  validateDateInput,
  startOfToday,
  nextAnniversary,
  weekdayName,
  businessDaysBetween,
  MIN_YEAR,
  MAX_YEAR,
} from "./dateMath";

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
    expect(result).toMatchObject({ years: 4, months: 2, days: 14, totalDays: expect.any(Number) });
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
    expect(result).toMatchObject({ years: 0, months: 0, days: 0, totalDays: 0 });
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

  it("reports total months and whole weeks alongside the breakdown", () => {
    const result = diffBetween(parseDateInput("2020-01-01"), parseDateInput("2024-03-15"));
    expect(result.totalMonths).toBe(4 * 12 + 2);
    expect(result.totalWeeks).toBe(Math.floor(result.totalDays / 7));
  });
});

describe("validateDateInput", () => {
  it("accepts a well-formed date", () => {
    const result = validateDateInput("2024-03-15");
    expect(result.ok).toBe(true);
    expect(result.date.getFullYear()).toBe(2024);
  });

  it("treats a missing value as empty rather than invalid", () => {
    expect(validateDateInput("")).toMatchObject({ ok: false, empty: true, error: "" });
  });

  it("rejects a malformed string", () => {
    expect(validateDateInput("15/03/2024")).toMatchObject({ ok: false, empty: false });
  });

  it("rejects an impossible date the Date constructor would silently roll forward", () => {
    // new Date(2025, 1, 30) is Mar 2, not an error.
    expect(validateDateInput("2025-02-30")).toMatchObject({ ok: false, empty: false });
  });

  it("accepts Feb 29 in a leap year", () => {
    expect(validateDateInput("2024-02-29").ok).toBe(true);
  });

  it("rejects Feb 29 in a non-leap year", () => {
    expect(validateDateInput("2023-02-29")).toMatchObject({ ok: false, empty: false });
  });

  it("enforces the supported year range", () => {
    expect(validateDateInput(`${MIN_YEAR - 1}-01-01`)).toMatchObject({ ok: false });
    expect(validateDateInput(`${MAX_YEAR + 1}-01-01`)).toMatchObject({ ok: false });
    expect(validateDateInput(`${MIN_YEAR}-01-01`).ok).toBe(true);
  });

  it("rejects a future date when allowFuture is false", () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    const iso = `${future.getFullYear()}-01-01`;
    expect(validateDateInput(iso, { allowFuture: false })).toMatchObject({ ok: false });
  });

  it("accepts today when allowFuture is false", () => {
    const today = startOfToday();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
      today.getDate()
    ).padStart(2, "0")}`;
    expect(validateDateInput(iso, { allowFuture: false }).ok).toBe(true);
  });

  it("uses the supplied label in its error messages", () => {
    const result = validateDateInput("nonsense", { label: "Start date" });
    expect(result.error).toContain("Start date");
  });
});

describe("nextAnniversary", () => {
  it("finds the anniversary later this year", () => {
    const from = new Date(2024, 0, 1); // Jan 1
    const result = nextAnniversary(new Date(1990, 5, 10), from); // Jun 10
    expect(result.date.getFullYear()).toBe(2024);
    expect(result.date.getMonth()).toBe(5);
    expect(result.daysUntil).toBeGreaterThan(0);
    expect(result.turning).toBe(34);
  });

  it("rolls to next year once this year's anniversary has passed", () => {
    const from = new Date(2024, 11, 1); // Dec 1
    const result = nextAnniversary(new Date(1990, 5, 10), from);
    expect(result.date.getFullYear()).toBe(2025);
    expect(result.turning).toBe(35);
  });

  it("returns zero days when the anniversary is today", () => {
    const from = new Date(2024, 5, 10);
    const result = nextAnniversary(new Date(1990, 5, 10), from);
    expect(result.daysUntil).toBe(0);
  });

  it("places a Feb 29 anniversary on Mar 1 in a non-leap year", () => {
    const from = new Date(2025, 0, 1);
    const result = nextAnniversary(new Date(2000, 1, 29), from);
    expect(result.date.getMonth()).toBe(2); // March
    expect(result.date.getDate()).toBe(1);
  });
});

describe("weekdayName", () => {
  it("names the weekday of a known date", () => {
    // 15 March 2024 was a Friday.
    expect(weekdayName(parseDateInput("2024-03-15"))).toBe("Friday");
  });
});

describe("businessDaysBetween", () => {
  it("counts weekdays across a full week", () => {
    // Mon 4 Mar 2024 -> Mon 11 Mar 2024 is 5 business days elapsed.
    expect(
      businessDaysBetween(parseDateInput("2024-03-04"), parseDateInput("2024-03-11"))
    ).toBe(5);
  });

  it("excludes the weekend in a Friday-to-Monday span", () => {
    expect(
      businessDaysBetween(parseDateInput("2024-03-08"), parseDateInput("2024-03-11"))
    ).toBe(1);
  });

  it("returns zero across a weekend with no weekdays in between", () => {
    // Sat 9 Mar -> Sun 10 Mar 2024.
    expect(
      businessDaysBetween(parseDateInput("2024-03-09"), parseDateInput("2024-03-10"))
    ).toBe(0);
  });

  it("returns zero for the same date", () => {
    expect(
      businessDaysBetween(parseDateInput("2024-03-04"), parseDateInput("2024-03-04"))
    ).toBe(0);
  });

  it("is order-independent", () => {
    const forward = businessDaysBetween(parseDateInput("2024-03-04"), parseDateInput("2024-03-29"));
    const backward = businessDaysBetween(parseDateInput("2024-03-29"), parseDateInput("2024-03-04"));
    expect(backward).toBe(forward);
  });

  it("never exceeds the total day count", () => {
    const start = parseDateInput("2024-01-01");
    const end = parseDateInput("2024-12-31");
    expect(businessDaysBetween(start, end)).toBeLessThanOrEqual(
      diffBetween(start, end).totalDays
    );
  });
});
