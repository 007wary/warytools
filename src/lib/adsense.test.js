import { describe, it, expect, afterEach, vi } from "vitest";
import { ADSENSE_PUBLISHER_ID, ADSENSE_CLIENT_ID, adsEnabled } from "./adsense";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("publisher id", () => {
  // The two forms are not interchangeable and mixing them up fails silently
  // in both directions: "ca-" in ads.txt verifies nothing, and a bare id in
  // the script tag's client parameter requests ads for no known publisher.
  it("exposes the bare id for ads.txt", () => {
    expect(ADSENSE_PUBLISHER_ID).toBe("pub-5519794416240476");
    expect(ADSENSE_PUBLISHER_ID.startsWith("ca-")).toBe(false);
  });

  it("exposes the ca- prefixed id for the script tag and meta tag", () => {
    expect(ADSENSE_CLIENT_ID).toBe("ca-pub-5519794416240476");
  });

  it("derives the client id from the publisher id", () => {
    // Guards the one edit that would let them drift apart.
    expect(ADSENSE_CLIENT_ID).toBe(`ca-${ADSENSE_PUBLISHER_ID}`);
  });
});

describe("adsEnabled", () => {
  it("serves ads in production", () => {
    expect(adsEnabled("production")).toBe(true);
  });

  it("does not serve ads on preview deploys", () => {
    // Clicking your own ads on a preview is invalid traffic, and a
    // *.vercel.app host is not an approved site.
    expect(adsEnabled("preview")).toBe(false);
  });

  it("does not serve ads on development deploys", () => {
    expect(adsEnabled("development")).toBe(false);
  });

  it("does not serve ads for an unrecognised environment", () => {
    // Fails closed: a new Vercel environment name must not start serving ads
    // by default. Mirrors robots.js treating "staging" as non-canonical.
    expect(adsEnabled("staging")).toBe(false);
  });

  it("treats a non-Vercel build as production-like", () => {
    // VERCEL_ENV is unset for local builds and self-hosted deploys, which
    // matches isNonCanonicalDeploy() in robots.js.
    expect(adsEnabled(undefined)).toBe(true);
  });

  it("reads VERCEL_ENV when no argument is given", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(adsEnabled()).toBe(false);

    vi.stubEnv("VERCEL_ENV", "production");
    expect(adsEnabled()).toBe(true);
  });
});
