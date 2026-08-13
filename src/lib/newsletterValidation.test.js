import { describe, expect, it } from "vitest";
import {
  MAX_EMAIL_LENGTH,
  SubscribeRejection,
  checkSubscription,
  normalizeEmail,
  rejectionMessage,
} from "./newsletterValidation";

describe("normalizeEmail", () => {
  it("trims and case-folds", () => {
    expect(normalizeEmail("  Wary@Example.COM ")).toBe("wary@example.com");
  });

  it("returns an empty string for non-strings", () => {
    for (const value of [null, undefined, 42, {}, []]) {
      expect(normalizeEmail(value)).toBe("");
    }
  });

  it("keeps plus-tags and dots, which are provider-specific rather than standard", () => {
    // Folding these would merge two addresses that are genuinely distinct at
    // providers other than Gmail.
    expect(normalizeEmail("a.b+tag@example.com")).toBe("a.b+tag@example.com");
  });
});

describe("checkSubscription", () => {
  it("accepts an ordinary address and returns it normalized", () => {
    const result = checkSubscription({ email: " Reader@Example.com " });
    expect(result).toEqual({ ok: true, value: { email: "reader@example.com" } });
  });

  it("accepts the address shapes a stricter regex would wrongly reject", () => {
    const valid = [
      "reader+blog@example.com",
      "first.last@sub.example.co.uk",
      "o'brien@example.ie",
      "user@example.technology",
      "user_name@example-host.com",
    ];

    for (const email of valid) {
      expect(checkSubscription({ email }).ok, email).toBe(true);
    }
  });

  it("rejects an empty or missing address", () => {
    for (const email of ["", "   ", null, undefined]) {
      expect(checkSubscription({ email })).toEqual({
        ok: false,
        reason: SubscribeRejection.EMAIL_EMPTY,
      });
    }
  });

  it("rejects an address past the RFC 5321 ceiling", () => {
    const email = `${"a".repeat(MAX_EMAIL_LENGTH)}@example.com`;
    expect(checkSubscription({ email })).toEqual({
      ok: false,
      reason: SubscribeRejection.EMAIL_TOO_LONG,
    });
  });

  it("rejects the typo shapes", () => {
    const invalid = ["reader", "reader@", "@example.com", "reader@example", "a b@example.com"];

    for (const email of invalid) {
      expect(checkSubscription({ email }), email).toEqual({
        ok: false,
        reason: SubscribeRejection.EMAIL_MALFORMED,
      });
    }
  });

  it("rejects CR/LF, which would inject a mail header", () => {
    // The address reaches a To: header, so "a@b.com\nBcc: victim@example.com"
    // must never validate.
    for (const email of ["a@b.com\nBcc: victim@example.com", "a@b.com\r\nX: y"]) {
      expect(checkSubscription({ email }).ok).toBe(false);
    }
  });

  it("rejects a filled honeypot before anything else", () => {
    const result = checkSubscription({ email: "real@example.com", website: "http://spam" });
    expect(result).toEqual({ ok: false, reason: SubscribeRejection.SPAM });
  });

  it("ignores an empty honeypot, which is what a person submits", () => {
    expect(checkSubscription({ email: "real@example.com", website: "" }).ok).toBe(true);
  });

  it("survives a non-object input", () => {
    for (const input of [null, undefined, "string", 7]) {
      expect(checkSubscription(input).ok).toBe(false);
    }
  });
});

describe("rejectionMessage", () => {
  it("returns a sentence for every known reason", () => {
    for (const reason of Object.values(SubscribeRejection)) {
      const message = rejectionMessage(reason);
      expect(message).toBeTruthy();
      expect(message.endsWith(".")).toBe(true);
    }
  });

  it("falls back rather than returning undefined for an unknown reason", () => {
    expect(rejectionMessage("not_a_reason")).toBeTruthy();
  });

  it("does not tell a bot it tripped the honeypot", () => {
    expect(rejectionMessage(SubscribeRejection.SPAM).toLowerCase()).not.toContain("spam");
  });
});
