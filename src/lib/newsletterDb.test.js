import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isNewsletterDbConfigured, newsletterDb } from "./newsletterDb";

// These tests guard the two properties that make the anon-revocation safe:
// the module must never fall back to a public key, and a missing service-role
// key must be detectable by callers rather than surfacing as a crash.

const ORIGINAL = { ...process.env };

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
});

afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe("isNewsletterDbConfigured", () => {
  it("is false without a service-role key", () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(isNewsletterDbConfigured()).toBe(false);
  });

  it("is false without a project URL", () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    expect(isNewsletterDbConfigured()).toBe(false);
  });

  it("does NOT accept the anon key as a substitute", () => {
    // The whole point of this module. Every newsletter RPC takes a raw email
    // and no token, so `anon` has been revoked from all of them; a fallback to
    // NEXT_PUBLIC_SUPABASE_ANON_KEY here would leave the routes calling with a
    // key that is now permission-denied, turning a security fix into an
    // outage — and, worse, would be the obvious "fix" for that outage.
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    expect(isNewsletterDbConfigured()).toBe(false);
  });

  it("is true once both are set", () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
    expect(isNewsletterDbConfigured()).toBe(true);
  });
});

describe("newsletterDb", () => {
  it("throws rather than building an unauthorized client", () => {
    // Refuse loudly. A client built with no key would fail at the RPC instead,
    // where the error reads as a database problem rather than a missing
    // variable.
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(() => newsletterDb()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("builds a client when configured", () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
    expect(newsletterDb()).toHaveProperty("rpc");
  });
});
