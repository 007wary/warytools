import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CONFIRM_TTL_SECONDS,
  NO_EXPIRY,
  TokenError,
  TokenPurpose,
  confirmUrl,
  createToken,
  unsubscribeUrl,
  verifyToken,
} from "./newsletterToken";

const SECRET = "test-secret-not-the-real-one";
const NOW = Date.UTC(2026, 7, 13, 12, 0, 0);

beforeEach(() => {
  process.env.NEWSLETTER_TOKEN_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.NEWSLETTER_TOKEN_SECRET;
});

describe("createToken / verifyToken round trip", () => {
  it("returns the address that was signed", () => {
    const token = createToken(TokenPurpose.CONFIRM, "reader@example.com", CONFIRM_TTL_SECONDS, NOW);
    expect(verifyToken(token, TokenPurpose.CONFIRM, NOW)).toEqual({
      ok: true,
      email: "reader@example.com",
    });
  });

  it("round-trips addresses whose characters would break a raw URL", () => {
    // `+` becomes a space under form decoding and `/` would collide with the
    // path — both are why the payload is base64url rather than the raw string.
    for (const email of ["a+tag@example.com", "o'brien@example.ie", "üser@exämple.de"]) {
      const token = createToken(TokenPurpose.UNSUBSCRIBE, email, NO_EXPIRY, NOW);
      expect(verifyToken(token, TokenPurpose.UNSUBSCRIBE, NOW), email).toEqual({
        ok: true,
        email,
      });
    }
  });

  it("emits no character that needs escaping in a URL", () => {
    const token = createToken(TokenPurpose.UNSUBSCRIBE, "a+b@example.com", NO_EXPIRY, NOW);
    expect(token).toBe(encodeURIComponent(token));
  });
});

describe("signature", () => {
  it("rejects a tampered address", () => {
    const token = createToken(TokenPurpose.UNSUBSCRIBE, "reader@example.com", NO_EXPIRY, NOW);
    const [purpose, , expiry, signature] = token.split(".");
    const forged = [
      purpose,
      Buffer.from("victim@example.com", "utf8").toString("base64url"),
      expiry,
      signature,
    ].join(".");

    expect(verifyToken(forged, TokenPurpose.UNSUBSCRIBE, NOW)).toEqual({
      ok: false,
      reason: TokenError.BAD_SIGNATURE,
    });
  });

  it("rejects an extended expiry, so the recipient cannot make a token immortal", () => {
    const token = createToken(TokenPurpose.CONFIRM, "reader@example.com", CONFIRM_TTL_SECONDS, NOW);
    const [purpose, email, , signature] = token.split(".");
    const forged = [purpose, email, "99999999999", signature].join(".");

    expect(verifyToken(forged, TokenPurpose.CONFIRM, NOW)).toEqual({
      ok: false,
      reason: TokenError.BAD_SIGNATURE,
    });
  });

  it("rejects a token minted with a different secret", () => {
    const token = createToken(TokenPurpose.CONFIRM, "reader@example.com", CONFIRM_TTL_SECONDS, NOW);
    process.env.NEWSLETTER_TOKEN_SECRET = "a-different-secret";

    expect(verifyToken(token, TokenPurpose.CONFIRM, NOW).ok).toBe(false);
  });

  it("refuses every token when the secret is unset, rather than accepting them", () => {
    const token = createToken(TokenPurpose.CONFIRM, "reader@example.com", CONFIRM_TTL_SECONDS, NOW);
    delete process.env.NEWSLETTER_TOKEN_SECRET;

    expect(verifyToken(token, TokenPurpose.CONFIRM, NOW)).toEqual({
      ok: false,
      reason: TokenError.BAD_SIGNATURE,
    });
  });
});

describe("purpose", () => {
  it("will not accept a confirm token as an unsubscribe token", () => {
    // Without the purpose inside the signed payload, the link that says "yes,
    // subscribe me" would be replayable to remove that same person.
    const token = createToken(TokenPurpose.CONFIRM, "reader@example.com", CONFIRM_TTL_SECONDS, NOW);
    expect(verifyToken(token, TokenPurpose.UNSUBSCRIBE, NOW)).toEqual({
      ok: false,
      reason: TokenError.WRONG_PURPOSE,
    });
  });

  it("will not accept an unsubscribe token as a confirm token", () => {
    const token = createToken(TokenPurpose.UNSUBSCRIBE, "reader@example.com", NO_EXPIRY, NOW);
    expect(verifyToken(token, TokenPurpose.CONFIRM, NOW)).toEqual({
      ok: false,
      reason: TokenError.WRONG_PURPOSE,
    });
  });

  it("rejects a rewritten purpose rather than mislabelling it", () => {
    // Swapping the prefix invalidates the signature, so this fails earlier
    // than the purpose check — which is the point: purpose is signed, not
    // merely compared.
    const token = createToken(TokenPurpose.CONFIRM, "reader@example.com", CONFIRM_TTL_SECONDS, NOW);
    const forged = token.replace(/^confirm\./, "unsubscribe.");

    expect(verifyToken(forged, TokenPurpose.UNSUBSCRIBE, NOW)).toEqual({
      ok: false,
      reason: TokenError.BAD_SIGNATURE,
    });
  });
});

describe("expiry", () => {
  it("accepts a confirm token inside its window", () => {
    const token = createToken(TokenPurpose.CONFIRM, "reader@example.com", CONFIRM_TTL_SECONDS, NOW);
    const almost = NOW + (CONFIRM_TTL_SECONDS - 60) * 1000;

    expect(verifyToken(token, TokenPurpose.CONFIRM, almost).ok).toBe(true);
  });

  it("rejects a confirm token past its window", () => {
    const token = createToken(TokenPurpose.CONFIRM, "reader@example.com", CONFIRM_TTL_SECONDS, NOW);
    const late = NOW + (CONFIRM_TTL_SECONDS + 60) * 1000;

    expect(verifyToken(token, TokenPurpose.CONFIRM, late)).toEqual({
      ok: false,
      reason: TokenError.EXPIRED,
    });
  });

  it("never expires an unsubscribe token", () => {
    // People unsubscribe from a post they finally opened months later, and an
    // expired unsubscribe link is the one link that is not optional.
    const token = createToken(TokenPurpose.UNSUBSCRIBE, "reader@example.com", NO_EXPIRY, NOW);
    const yearsLater = NOW + 5 * 365 * 24 * 60 * 60 * 1000;

    expect(verifyToken(token, TokenPurpose.UNSUBSCRIBE, yearsLater).ok).toBe(true);
  });
});

describe("malformed input", () => {
  it("rejects rather than throwing on junk", () => {
    const junk = [
      "",
      null,
      undefined,
      42,
      "not-a-token",
      "a.b.c",
      "a.b.c.d.e",
      "....",
      "confirm..0.sig",
    ];

    for (const token of junk) {
      const result = verifyToken(token, TokenPurpose.CONFIRM, NOW);
      expect(result.ok, String(token)).toBe(false);
      expect(typeof result.reason).toBe("string");
    }
  });

  it("returns rather than throwing on random bytes", () => {
    // Fuzz-lite, in the spirit of imageMetadata's walkers: this parses
    // untrusted input from a URL bar, so the only assertion that matters is
    // that it comes back at all.
    for (let i = 0; i < 200; i += 1) {
      const length = 1 + Math.floor(Math.random() * 80);
      let token = "";
      for (let j = 0; j < length; j += 1) {
        token += String.fromCharCode(32 + Math.floor(Math.random() * 95));
      }

      expect(() => verifyToken(token, TokenPurpose.CONFIRM, NOW)).not.toThrow();
    }
  });
});

describe("link builders", () => {
  it("builds a confirm link that verifies as a confirm token", () => {
    const url = confirmUrl("https://wary.tools", "reader@example.com", NOW);
    expect(url.startsWith("https://wary.tools/newsletter/confirm?token=")).toBe(true);

    const token = new URL(url).searchParams.get("token");
    expect(verifyToken(token, TokenPurpose.CONFIRM, NOW)).toEqual({
      ok: true,
      email: "reader@example.com",
    });
  });

  it("builds an unsubscribe link that verifies as an unsubscribe token", () => {
    const url = unsubscribeUrl("https://wary.tools", "reader@example.com", NOW);
    expect(url.startsWith("https://wary.tools/newsletter/unsubscribe?token=")).toBe(true);

    const token = new URL(url).searchParams.get("token");
    expect(verifyToken(token, TokenPurpose.UNSUBSCRIBE, NOW)).toEqual({
      ok: true,
      email: "reader@example.com",
    });
  });

  it("survives the round trip through URL parsing for an address with a plus tag", () => {
    // A `+` that survives minting but decodes to a space in the route would
    // unsubscribe nobody, silently.
    const url = unsubscribeUrl("https://wary.tools", "a+tag@example.com", NOW);
    const token = new URL(url).searchParams.get("token");

    expect(verifyToken(token, TokenPurpose.UNSUBSCRIBE, NOW).email).toBe("a+tag@example.com");
  });
});
