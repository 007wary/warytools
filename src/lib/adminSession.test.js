import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  createSession,
  secretMatches,
  sessionCookieOptions,
  verifySession,
} from "./adminSession";

const SECRET = "test-secret-not-the-real-one";
const NOW = Date.UTC(2026, 7, 13, 12, 0, 0);

beforeEach(() => {
  process.env.NEWSLETTER_TOKEN_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.NEWSLETTER_TOKEN_SECRET;
});

describe("secretMatches", () => {
  it("accepts an exact match", () => {
    expect(secretMatches("hunter2", "hunter2")).toBe(true);
  });

  it("rejects a mismatch, a prefix, and a differing length", () => {
    expect(secretMatches("hunter2", "hunter3")).toBe(false);
    expect(secretMatches("hunter", "hunter2")).toBe(false);
    expect(secretMatches("hunter22", "hunter2")).toBe(false);
  });

  it("rejects empty and non-string input rather than throwing", () => {
    // timingSafeEqual throws on a length mismatch, so these must be guarded
    // before it is reached.
    for (const value of ["", null, undefined, 42, {}, []]) {
      expect(secretMatches(value, "hunter2"), String(value)).toBe(false);
      expect(secretMatches("hunter2", value), String(value)).toBe(false);
    }
  });
});

describe("createSession / verifySession", () => {
  it("accepts a session it just minted", () => {
    expect(verifySession(createSession(NOW), NOW)).toBe(true);
  });

  it("accepts a session inside its window", () => {
    const session = createSession(NOW);
    expect(verifySession(session, NOW + (SESSION_TTL_SECONDS - 60) * 1000)).toBe(true);
  });

  it("rejects a session past its window", () => {
    const session = createSession(NOW);
    expect(verifySession(session, NOW + (SESSION_TTL_SECONDS + 60) * 1000)).toBe(false);
  });

  it("rejects an extended expiry, so a session cannot be made immortal", () => {
    // The expiry is inside the signature. Without that, anyone holding a
    // valid cookie could edit the number and never be logged out.
    const session = createSession(NOW);
    const [issuedAt, , signature] = session.split(".");
    const forged = [issuedAt, "99999999999", signature].join(".");

    expect(verifySession(forged, NOW)).toBe(false);
  });

  it("rejects a session signed with a different secret", () => {
    const session = createSession(NOW);
    process.env.NEWSLETTER_TOKEN_SECRET = "a-different-secret";

    expect(verifySession(session, NOW)).toBe(false);
  });

  it("refuses every session when the secret is unset, rather than admitting everyone", () => {
    const session = createSession(NOW);
    delete process.env.NEWSLETTER_TOKEN_SECRET;

    expect(verifySession(session, NOW)).toBe(false);
  });

  it("is namespaced, so a newsletter token cannot be spent as a session", () => {
    // The payload is prefixed with "admin." before signing. Without that, a
    // signed value from newsletterToken.js with a matching shape could be
    // presented here.
    const notASession = "unsubscribe.YWJjQGV4YW1wbGUuY29t.0";
    expect(verifySession(notASession, NOW)).toBe(false);
  });

  it("rejects junk rather than throwing", () => {
    const junk = ["", null, undefined, 42, "a.b", "a.b.c.d", "...", "not-a-session"];

    for (const value of junk) {
      expect(() => verifySession(value, NOW)).not.toThrow();
      expect(verifySession(value, NOW), String(value)).toBe(false);
    }
  });

  it("returns rather than throwing on random bytes", () => {
    for (let i = 0; i < 200; i += 1) {
      const length = 1 + Math.floor(Math.random() * 60);
      let value = "";
      for (let j = 0; j < length; j += 1) {
        value += String.fromCharCode(32 + Math.floor(Math.random() * 95));
      }

      expect(() => verifySession(value, NOW)).not.toThrow();
    }
  });
});

describe("sessionCookieOptions", () => {
  const options = sessionCookieOptions();

  it("is httpOnly, so an XSS cannot read the session", () => {
    expect(options.httpOnly).toBe(true);
  });

  it("is sameSite strict, so another origin cannot trigger a send with it", () => {
    // This is what makes CSRF against the send endpoint impossible: the cookie
    // is not attached to cross-site requests at all.
    expect(options.sameSite).toBe("strict");
  });

  it("is scoped to the whole site, so it reaches both /admin and /api/admin", () => {
    expect(options.path).toBe("/");
  });

  it("expires with the session rather than persisting forever", () => {
    expect(options.maxAge).toBe(SESSION_TTL_SECONDS);
    expect(sessionCookieOptions(0).maxAge).toBe(0);
  });
});

describe("SESSION_COOKIE", () => {
  it("is namespaced so it cannot collide with another cookie on the domain", () => {
    expect(SESSION_COOKIE).toBe("wt_admin");
  });
});
