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

describe("the send loop fits inside the function's timeout", () => {
  // Not testing this module's code — testing the relationship between the cap
  // it resolves and two constants in /api/newsletter/send that scale with it.
  //
  // This is the guard on a real bug: the send route paces itself at 550ms per
  // recipient and originally set no maxDuration at all, so a full day's list
  // ran ~55s against Vercel's much lower default and was killed partway. The
  // slug is claimed BEFORE the first email (the duplicate-send guard), so a
  // timeout marks the post sent with most of the list unmailed and no way to
  // ever deliver it — the exact unrecoverable state the cap exists to prevent,
  // reached from a different direction.
  //
  // Hardcoded rather than imported, for the same reason pdfToWordLimits.test.js
  // hardcodes maxDuration: it is a route-segment export that cannot be
  // imported without pulling the whole route (and its env vars) into the test.
  const SEND_INTERVAL_MS = 550;
  const MAX_DURATION_S = 300;
  // The queries either side of the loop, plus Resend's own latency per call.
  const OVERHEAD_S = 30;

  it("leaves headroom for a full default-cap run", () => {
    const capacity = resolveDailyCap(undefined);
    // Paced BETWEEN sends, so n recipients sleep n-1 times.
    const loopSeconds = ((capacity - 1) * SEND_INTERVAL_MS) / 1000;

    expect(loopSeconds + OVERHEAD_S).toBeLessThan(MAX_DURATION_S);
  });

  it("flags the cap at which a single invocation stops being viable", () => {
    // Documents the ceiling rather than asserting a bug: past roughly this
    // many recipients the send must become resumable (a cursor in the ledger)
    // instead of one long request. If someone raises the cap for a paid Resend
    // plan, this is the number they are up against.
    const maxRecipients =
      Math.floor(((MAX_DURATION_S - OVERHEAD_S) * 1000) / SEND_INTERVAL_MS) + 1;

    expect(maxRecipients).toBeGreaterThan(DEFAULT_DAILY_SEND_CAP);
    expect(maxRecipients).toBeLessThan(1000);
  });
});
