import { describe, it, expect, afterEach, vi } from "vitest";
import robots from "./robots";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("robots (production)", () => {
  it("allows crawling and advertises the sitemap", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const result = robots();

    expect(result.rules.allow).toBe("/");
    expect(result.sitemap).toBe("https://wary.tools/sitemap.xml");
  });

  it("blocks the shortener redirect, api, admin and newsletter routes", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(robots().rules.disallow).toEqual(["/s/", "/api/", "/admin", "/newsletter/"]);
  });

  it("keeps the real pages crawlable", () => {
    // Guards against a disallow entry being written broadly enough to catch
    // the tools and blog — "/" prefixes like "/a" would, and the failure would
    // be silent until traffic dropped.
    vi.stubEnv("VERCEL_ENV", "production");
    const { disallow } = robots().rules;

    for (const path of ["/pdf/merge", "/image/compress", "/blog", "/about", "/"]) {
      expect(disallow.some((rule) => path.startsWith(rule)), path).toBe(false);
    }
  });

  it("treats a non-Vercel build as canonical", () => {
    // VERCEL_ENV unset: local `next build` or another host should still get a
    // normal production robots.txt rather than a site-wide block.
    vi.stubEnv("VERCEL_ENV", undefined);
    const result = robots();

    expect(result.rules.allow).toBe("/");
    expect(result.sitemap).toBeDefined();
  });

  it("emits an absolute sitemap URL with no double slash", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const { sitemap } = robots();

    expect(sitemap.startsWith("https://")).toBe(true);
    expect(sitemap.slice("https://".length)).not.toContain("//");
  });
});

describe("robots (preview / staging)", () => {
  it("blocks all crawling on preview deploys", () => {
    // Preview deploys serve a full copy of the site on a *.vercel.app host;
    // allowing crawling there duplicates every canonical URL on a
    // non-canonical domain.
    vi.stubEnv("VERCEL_ENV", "preview");
    const result = robots();

    expect(result.rules.disallow).toBe("/");
    expect(result.rules.allow).toBeUndefined();
  });

  it("omits the sitemap on preview deploys", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    // Advertising the production sitemap from a preview host would point
    // crawlers at 23 canonical URLs from the wrong origin.
    expect(robots().sitemap).toBeUndefined();
  });

  it("blocks crawling on vercel development deploys", () => {
    vi.stubEnv("VERCEL_ENV", "development");
    expect(robots().rules.disallow).toBe("/");
  });

  it("blocks crawling for any unrecognised non-production env", () => {
    vi.stubEnv("VERCEL_ENV", "staging");
    expect(robots().rules.disallow).toBe("/");
  });
});
