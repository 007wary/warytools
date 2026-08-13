import { describe, expect, it } from "vitest";
import { buildRssFeed, escapeXml, rfc822 } from "./blogFeed";

const SITE = "https://wary.tools";

function post(overrides = {}) {
  return {
    slug: "a-post",
    title: "A post",
    description: "What the post is about.",
    date: new Date("2026-08-13T00:00:00.000Z"),
    category: "guide",
    ...overrides,
  };
}

describe("escapeXml", () => {
  it("escapes all five predefined entities", () => {
    expect(escapeXml(`<a href="x">&'`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&apos;");
  });

  // Order matters: replacing & last would re-escape the ampersands the other
  // replacements introduce, producing &amp;lt;.
  it("does not double-escape", () => {
    expect(escapeXml("a & <b>")).toBe("a &amp; &lt;b&gt;");
  });

  it("coerces non-strings", () => {
    expect(escapeXml(42)).toBe("42");
  });
});

describe("rfc822", () => {
  it("formats in RFC 822, not ISO 8601", () => {
    expect(rfc822(new Date("2026-08-13T00:00:00.000Z"))).toBe("Thu, 13 Aug 2026 00:00:00 GMT");
  });

  it("zero-pads single-digit days and times", () => {
    expect(rfc822(new Date("2026-01-05T09:07:03.000Z"))).toBe("Mon, 05 Jan 2026 09:07:03 GMT");
  });

  it("reads UTC components, not local ones", () => {
    // 23:30 UTC is the previous local day in the Americas; a getDate()-based
    // implementation would emit the 12th here.
    expect(rfc822(new Date("2026-08-13T23:30:00.000Z"))).toContain("13 Aug 2026");
  });
});

describe("buildRssFeed", () => {
  it("emits a well-formed channel with one item per post", () => {
    const xml = buildRssFeed({ siteUrl: SITE, posts: [post(), post({ slug: "b", title: "B" })] });
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml.match(/<item>/g)).toHaveLength(2);
    expect(xml).toContain("<link>https://wary.tools/blog/a-post</link>");
  });

  it("uses the post URL as a permalink guid", () => {
    const xml = buildRssFeed({ siteUrl: SITE, posts: [post()] });
    expect(xml).toContain('<guid isPermaLink="true">https://wary.tools/blog/a-post</guid>');
  });

  it("declares a self link", () => {
    const xml = buildRssFeed({ siteUrl: SITE, posts: [post()] });
    expect(xml).toContain('href="https://wary.tools/blog/feed.xml"');
  });

  // The failure this guards is total, not partial: one unescaped apostrophe
  // invalidates the document and most readers reject the whole feed.
  it("escapes titles and descriptions", () => {
    const xml = buildRssFeed({
      siteUrl: SITE,
      posts: [post({ title: "What's in a <PDF> & why", description: `Quotes "here" too.` })],
    });
    expect(xml).toContain("What&apos;s in a &lt;PDF&gt; &amp; why");
    expect(xml).not.toMatch(/<title>[^<]*<PDF>/);
  });

  // lastBuildDate tracking the build time makes every deploy look like a feed
  // update to polling aggregators.
  it("dates lastBuildDate from the newest post, not the build", () => {
    const buildTime = new Date("2027-01-01T00:00:00.000Z");
    const xml = buildRssFeed({ siteUrl: SITE, posts: [post()], now: buildTime });
    expect(xml).toContain("<lastBuildDate>Thu, 13 Aug 2026 00:00:00 GMT</lastBuildDate>");
    expect(xml).not.toContain("2027");
  });

  it("falls back to now when there are no posts", () => {
    const now = new Date("2026-08-13T00:00:00.000Z");
    const xml = buildRssFeed({ siteUrl: SITE, posts: [], now });
    expect(xml).toContain("Thu, 13 Aug 2026");
    expect(xml).not.toContain("<item>");
  });

  it("omits the category element when a post has none", () => {
    const xml = buildRssFeed({ siteUrl: SITE, posts: [post({ category: undefined })] });
    expect(xml).not.toContain("<category>");
  });
});
