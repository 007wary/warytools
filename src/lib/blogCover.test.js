import { describe, expect, it } from "vitest";
import {
  ALLOWED_COVER_EXTENSIONS,
  CoverError,
  coverAltFor,
  coverImageUrl,
  normalizeCoverPath,
  validateCoverSize,
} from "./blogCover";

describe("normalizeCoverPath", () => {
  it("accepts a root-relative path under /blog/", () => {
    expect(normalizeCoverPath("/blog/cover.jpg")).toBe("/blog/cover.jpg");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeCoverPath("  /blog/cover.png  ")).toBe("/blog/cover.png");
  });

  it("accepts every allowed extension, case-insensitively", () => {
    for (const extension of ALLOWED_COVER_EXTENSIONS) {
      expect(normalizeCoverPath(`/blog/cover${extension.toUpperCase()}`)).toContain("/blog/cover");
    }
  });

  // A remote cover would need the host allowlisted in next.config, would sit
  // outside version control, and would make the page depend on someone else's
  // server — against the whole premise of the site.
  it.each([
    "https://example.com/cover.jpg",
    "http://example.com/cover.jpg",
    "//example.com/cover.jpg",
    "data:image/png;base64,AAAA",
  ])("rejects the remote URL %s", (value) => {
    expect(() => normalizeCoverPath(value)).toThrow(CoverError);
  });

  it("rejects a path outside /blog/", () => {
    expect(() => normalizeCoverPath("/images/cover.jpg")).toThrow(/must start with \/blog\//);
  });

  it("rejects a relative path", () => {
    expect(() => normalizeCoverPath("cover.jpg")).toThrow(/must start with \/blog\//);
  });

  // Traversal would be resolved differently by next/image than by the
  // build-time existence check, so the check could pass against one file
  // while the page served another.
  it("rejects path traversal", () => {
    expect(() => normalizeCoverPath("/blog/../../secret.jpg")).toThrow(/must not contain/);
  });

  // SVG can carry script and is also handed to social crawlers and declared
  // in JSON-LD; AVIF is not decodable by several of those crawlers.
  it.each([".svg", ".avif", ".gif", ".bmp", ".pdf"])("rejects %s", (extension) => {
    expect(() => normalizeCoverPath(`/blog/cover${extension}`)).toThrow(/must be one of/);
  });

  it("rejects an empty or non-string value", () => {
    expect(() => normalizeCoverPath("")).toThrow(CoverError);
    expect(() => normalizeCoverPath(undefined)).toThrow(CoverError);
  });

  it("attaches the filename to the error", () => {
    expect(() => normalizeCoverPath("/nope.jpg", "post.mdx")).toThrow(/post\.mdx/);
  });
});

describe("coverAltFor", () => {
  it("returns null for a post with no cover", () => {
    expect(coverAltFor({})).toBeNull();
  });

  it("returns the trimmed alt text", () => {
    expect(coverAltFor({ cover: "/blog/a.jpg", coverAlt: "  A PDF page grid  " })).toBe(
      "A PDF page grid",
    );
  });

  // Not defaulted to the title: alt text echoing the adjacent <h1> makes a
  // screen reader announce the same sentence twice, which is worse than a
  // decorative image with alt="".
  it("throws when a cover has no alt text", () => {
    expect(() => coverAltFor({ cover: "/blog/a.jpg" })).toThrow(/must also set `coverAlt`/);
  });

  it("throws when alt text is only whitespace", () => {
    expect(() => coverAltFor({ cover: "/blog/a.jpg", coverAlt: "   " })).toThrow(/coverAlt/);
  });
});

describe("validateCoverSize", () => {
  it("accepts the recommended size", () => {
    expect(() => validateCoverSize({ width: 1200, height: 630 })).not.toThrow();
  });

  // The real committed cover. A few percent off 1.91:1 is invisible once
  // objectFit crops it, so refusing it would be the tool being wrong.
  it("accepts a near-ratio cover", () => {
    expect(() => validateCoverSize({ width: 1424, height: 752 })).not.toThrow();
  });

  it("accepts a larger cover at the right ratio", () => {
    expect(() => validateCoverSize({ width: 2400, height: 1260 })).not.toThrow();
  });

  // Below 1200px, og:image and Google's article guidance both downgrade the
  // preview silently — the post still shares, it just shares badly.
  it("rejects a cover narrower than 1200px", () => {
    expect(() => validateCoverSize({ width: 800, height: 420 })).toThrow(/at least 1200px/);
  });

  it.each([
    [1200, 1200], // square
    [1200, 1800], // portrait
    [3000, 630], // ultra-wide banner
  ])("rejects %ix%i for being the wrong shape", (width, height) => {
    expect(() => validateCoverSize({ width, height })).toThrow(/should be close to/);
  });

  it("names the file in the error", () => {
    expect(() => validateCoverSize({ width: 400, height: 210 }, "post.mdx")).toThrow(/post\.mdx/);
  });
});

describe("coverImageUrl", () => {
  // Social crawlers and schema.org both ignore root-relative paths, which
  // reads as "no image" rather than as an error.
  it("builds an absolute URL", () => {
    expect(coverImageUrl({ cover: "/blog/a.jpg" }, "https://wary.tools")).toBe(
      "https://wary.tools/blog/a.jpg",
    );
  });

  it("returns null for a post with no cover", () => {
    expect(coverImageUrl({}, "https://wary.tools")).toBeNull();
  });
});
