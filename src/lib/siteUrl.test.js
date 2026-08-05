import { describe, it, expect } from "vitest";
import { normalizeSiteUrl, absoluteUrl, SITE_URL } from "./siteUrl";

const DEFAULT = "https://wary.tools";

describe("normalizeSiteUrl", () => {
  it("passes through a well-formed URL unchanged", () => {
    expect(normalizeSiteUrl("https://wary.tools")).toBe("https://wary.tools");
  });

  it("strips a trailing slash", () => {
    // The bug this exists to prevent: a trailing slash here produced
    // "https://wary.tools//sitemap.xml" in robots.txt and a double slash in
    // all 23 sitemap URLs.
    expect(normalizeSiteUrl("https://wary.tools/")).toBe("https://wary.tools");
  });

  it("strips repeated trailing slashes", () => {
    expect(normalizeSiteUrl("https://wary.tools///")).toBe("https://wary.tools");
  });

  it("preserves a path prefix while stripping its trailing slash", () => {
    expect(normalizeSiteUrl("https://example.com/app/")).toBe("https://example.com/app");
  });

  it("falls back to the default for unset or blank values", () => {
    expect(normalizeSiteUrl(undefined)).toBe(DEFAULT);
    expect(normalizeSiteUrl("")).toBe(DEFAULT);
    expect(normalizeSiteUrl("   ")).toBe(DEFAULT);
  });

  it("falls back to the default for non-string values", () => {
    expect(normalizeSiteUrl(null)).toBe(DEFAULT);
    expect(normalizeSiteUrl(42)).toBe(DEFAULT);
  });

  it("falls back to the default for a URL with no scheme", () => {
    // "wary.tools" would otherwise be concatenated into "wary.tools/pdf",
    // which is not a usable absolute URL in a sitemap or canonical tag.
    expect(normalizeSiteUrl("wary.tools")).toBe(DEFAULT);
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeSiteUrl("  https://staging.example.com/  ")).toBe("https://staging.example.com");
  });

  it("always yields a value safe to concatenate with a leading-slash path", () => {
    for (const input of ["https://wary.tools/", "https://wary.tools", "", null, "wary.tools"]) {
      expect(`${normalizeSiteUrl(input)}/sitemap.xml`).not.toContain("//sitemap.xml");
    }
  });
});

describe("absoluteUrl", () => {
  it("builds an absolute URL from a root-relative path", () => {
    expect(absoluteUrl("/pdf/merge")).toBe(`${SITE_URL}/pdf/merge`);
  });

  it("tolerates a path missing its leading slash", () => {
    expect(absoluteUrl("pdf/merge")).toBe(`${SITE_URL}/pdf/merge`);
  });

  // The bare origin, not "${SITE_URL}/": Next normalizes the homepage's
  // canonical to a URL with no trailing slash and the sitemap emits the same,
  // so JSON-LD must agree rather than declaring a second string for one page.
  it("returns the bare origin for the site root", () => {
    expect(absoluteUrl()).toBe(SITE_URL);
    expect(absoluteUrl("/")).toBe(SITE_URL);
  });

  it("never produces a double slash", () => {
    expect(absoluteUrl("/about")).not.toContain("tools//");
  });
});
