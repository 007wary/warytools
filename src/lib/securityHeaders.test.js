import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config.mjs";

// Header regressions are invisible: the site renders identically whether these
// are present, absent, or set to the wrong value. The two cross-origin headers
// in particular have failure modes that only appear off-site — a broken social
// card, or an ad slot that blanks for a subset of visitors — so nothing in a
// local check would catch them.
//
// next.config.mjs is imported directly rather than duplicating the list, so a
// header removed there fails here rather than being silently untested.

async function headerRules() {
  return nextConfig.headers();
}

/**
 * Resolves a header the way Next does: every matching rule applies, and for a
 * repeated key the LAST match wins. That ordering is the whole mechanism
 * behind the image overrides, so the test models it rather than assuming it.
 */
function resolve(rules, pathname, key) {
  let value;
  for (const rule of rules) {
    if (!matches(rule.source, pathname)) continue;
    for (const header of rule.headers) {
      if (header.key.toLowerCase() === key.toLowerCase()) value = header.value;
    }
  }
  return value;
}

/** A small matcher for the two path-pattern shapes this config uses. */
function matches(source, pathname) {
  if (source === "/:path*") return true;

  // "/blog/:file*.(jpg|jpeg|png|webp|gif)"
  const extGroup = source.match(/^(.*)\/:[\w]+\*\.\(([\w|]+)\)$/);
  if (extGroup) {
    const [, prefix, exts] = extGroup;
    const pattern = new RegExp(`^${prefix}/.+\\.(${exts})$`);
    return pattern.test(pathname);
  }

  return source === pathname;
}

describe("security headers", () => {
  it("applies a baseline set to every path", async () => {
    const rules = await headerRules();

    for (const key of [
      "Content-Security-Policy",
      "X-Frame-Options",
      "X-Content-Type-Options",
      "Referrer-Policy",
      "Strict-Transport-Security",
      "Permissions-Policy",
    ]) {
      expect(resolve(rules, "/pdf/merge", key), key).toBeTruthy();
    }
  });

  describe("Cross-Origin-Opener-Policy", () => {
    it("is set on every page", async () => {
      const rules = await headerRules();
      expect(resolve(rules, "/pdf/merge", "Cross-Origin-Opener-Policy")).toBe(
        "same-origin-allow-popups"
      );
    });

    it("allows popups, so the consent flow can post its choice back", async () => {
      const rules = await headerRules();
      // Plain `same-origin` severs popups this page opens deliberately, which
      // breaks Google's CMP "Manage options" screen — a failure visible only
      // to EEA/UK/Swiss visitors, so no local check would ever surface it.
      expect(resolve(rules, "/", "Cross-Origin-Opener-Policy")).not.toBe("same-origin");
    });
  });

  describe("Cross-Origin-Resource-Policy", () => {
    it("defaults to same-origin for pages and scripts", async () => {
      const rules = await headerRules();

      expect(resolve(rules, "/", "Cross-Origin-Resource-Policy")).toBe("same-origin");
      expect(resolve(rules, "/pdf/merge", "Cross-Origin-Resource-Policy")).toBe("same-origin");
      expect(resolve(rules, "/pdf.worker.min.mjs", "Cross-Origin-Resource-Policy")).toBe(
        "same-origin"
      );
    });

    it("relaxes to cross-origin for social preview images", async () => {
      const rules = await headerRules();

      // These are rendered on other people's domains by definition. Under
      // same-origin the unfurl silently stops showing an image, while a curl
      // of the same URL looks perfectly healthy.
      for (const path of ["/opengraph-image", "/apple-icon.png", "/icon-512.png"]) {
        expect(resolve(rules, path, "Cross-Origin-Resource-Policy"), path).toBe("cross-origin");
      }
    });

    it("relaxes blog covers of every declared image type", async () => {
      const rules = await headerRules();

      for (const ext of ["jpg", "jpeg", "png", "webp", "gif"]) {
        expect(
          resolve(rules, `/blog/a-post.${ext}`, "Cross-Origin-Resource-Policy"),
          ext
        ).toBe("cross-origin");
      }
    });

    it("does not relax a non-image under /blog", async () => {
      const rules = await headerRules();
      // The override is a deliberate hole and should cover exactly the assets
      // that need it — a blog *page* is not one of them.
      expect(resolve(rules, "/blog/how-to-merge-pdfs", "Cross-Origin-Resource-Policy")).toBe(
        "same-origin"
      );
    });

    it("orders the image overrides after the catch-all, or they never apply", async () => {
      const rules = await headerRules();

      const catchAllIndex = rules.findIndex((r) => r.source === "/:path*");
      const overrideIndexes = rules
        .map((rule, index) => ({ rule, index }))
        .filter(({ rule }) =>
          rule.headers.some((h) => h.key === "Cross-Origin-Resource-Policy" && h.value === "cross-origin")
        )
        .map(({ index }) => index);

      expect(overrideIndexes.length).toBeGreaterThan(0);
      // Last match wins in Next. Put these first and they are overwritten by
      // the site-wide same-origin, with nothing anywhere reporting a conflict.
      for (const index of overrideIndexes) {
        expect(index).toBeGreaterThan(catchAllIndex);
      }
    });
  });

  describe("Cross-Origin-Embedder-Policy", () => {
    it("is deliberately not set", async () => {
      const rules = await headerRules();

      // `require-corp` would demand a CORP header from every cross-origin
      // subresource. The ad stack serves creatives and frames from hosts that
      // send none, so it would blank the entire inventory site-wide — reported
      // by AdSense as zero impressions with no diagnosis. It buys nothing
      // here either: its purpose is unlocking SharedArrayBuffer, which nothing
      // on this site uses.
      expect(resolve(rules, "/", "Cross-Origin-Embedder-Policy")).toBeUndefined();
    });
  });

  describe("framing", () => {
    it("refuses to be embedded, by both the modern and legacy mechanism", async () => {
      const rules = await headerRules();

      expect(resolve(rules, "/", "X-Frame-Options")).toBe("DENY");
      // frame-ancestors is what modern browsers honour; X-Frame-Options is the
      // fallback. COOP above covers the opposite direction and replaces neither.
      expect(resolve(rules, "/", "Content-Security-Policy")).toContain("frame-ancestors 'none'");
    });
  });
});
