import { describe, expect, it } from "vitest";
import {
  DEFAULT_DAILY_SEND_CAP,
  overCapMessage,
  resolveDailyCap,
} from "./newsletterSendQuota";

describe("resolveDailyCap", () => {
  it("defaults to Resend's free-tier limit when unset", () => {
    expect(resolveDailyCap(undefined)).toBe(DEFAULT_DAILY_SEND_CAP);
    expect(resolveDailyCap(null)).toBe(DEFAULT_DAILY_SEND_CAP);
    expect(resolveDailyCap("")).toBe(DEFAULT_DAILY_SEND_CAP);
    expect(resolveDailyCap("   ")).toBe(DEFAULT_DAILY_SEND_CAP);
  });

  it("accepts a raised cap for a paid plan", () => {
    expect(resolveDailyCap("5000")).toBe(5000);
    expect(resolveDailyCap(" 250 ")).toBe(250);
  });

  it("falls back rather than disabling the guard on a malformed value", () => {
    // The failure that matters: `Number(value) || 0` would yield 0 here, and a
    // cap of 0 refuses everything — or, read the other way, an unparseable
    // value must never be treated as "no limit".
    for (const bad of ["abc", "12abc", "{}", "[]"]) {
      expect(resolveDailyCap(bad), bad).toBe(DEFAULT_DAILY_SEND_CAP);
    }
  });

  it("rejects Infinity, which would silently remove the cap", () => {
    // !Number.isNaN(Infinity) is true, which is exactly why this module uses
    // Number.isFinite instead.
    expect(resolveDailyCap("Infinity")).toBe(DEFAULT_DAILY_SEND_CAP);
    expect(resolveDailyCap("-Infinity")).toBe(DEFAULT_DAILY_SEND_CAP);
  });

  it("rejects zero and negatives rather than refusing every send forever", () => {
    expect(resolveDailyCap("0")).toBe(DEFAULT_DAILY_SEND_CAP);
    expect(resolveDailyCap("-10")).toBe(DEFAULT_DAILY_SEND_CAP);
  });

  it("rejects fractions, which have no meaning in whole emails", () => {
    expect(resolveDailyCap("99.5")).toBe(DEFAULT_DAILY_SEND_CAP);
  });
});

describe("overCapMessage", () => {
  const message = overCapMessage({ recipients: 40, cap: 100, alreadySentToday: 80 });

  it("names the numbers the operator needs to act", () => {
    expect(message).toContain("40");
    expect(message).toContain("100");
    expect(message).toContain("80");
    expect(message).toContain("20"); // remaining
  });

  it("states plainly that nothing was sent and the post is still unsent", () => {
    // The most important sentence in the message: without it the operator
    // cannot tell a refused send from a partial one, and would not know
    // whether retrying tomorrow duplicates anything.
    expect(message).toContain("Nothing was emailed");
    expect(message).toContain("NOT marked as sent");
  });

  it("names both ways out", () => {
    expect(message).toContain("NEWSLETTER_DAILY_SEND_CAP");
    expect(message.toLowerCase()).toContain("tomorrow");
  });

  it("never reports negative remaining capacity", () => {
    // Reachable if the cap is lowered after sends have already happened.
    const over = overCapMessage({ recipients: 5, cap: 100, alreadySentToday: 140 });
    expect(over).toContain("only 0 of today's");
    expect(over).not.toContain("-");
  });
});
