import { describe, expect, it } from "vitest";
import {
  collectTags,
  displayDate,
  filterPublished,
  isoDate,
  readingTimeMinutes,
  relatedPosts,
  sortPosts,
} from "./blogPostList";

function post(slug, overrides = {}) {
  return {
    slug,
    title: slug,
    date: new Date("2026-01-01T00:00:00.000Z"),
    category: "guide",
    tags: [],
    ...overrides,
  };
}

describe("readingTimeMinutes", () => {
  it("rounds to whole minutes", () => {
    expect(readingTimeMinutes("word ".repeat(450))).toBe(2);
  });

  it("never returns less than one minute", () => {
    expect(readingTimeMinutes("Three short words.")).toBe(1);
    expect(readingTimeMinutes("")).toBe(1);
  });

  it("survives a non-string body", () => {
    expect(readingTimeMinutes(undefined)).toBe(1);
  });

  // The reason the stripping exists: an unstripped estimate roughly doubles
  // on a post carrying components and code, and an obviously-wrong label
  // undermines the feature everywhere it appears.
  it("excludes fenced code blocks", () => {
    const prose = "word ".repeat(225);
    const withCode = `${prose}\n\n\`\`\`js\n${"token ".repeat(900)}\n\`\`\``;
    expect(readingTimeMinutes(withCode)).toBe(readingTimeMinutes(prose));
  });

  it("excludes JSX markup but keeps its rendered text", () => {
    const bare = "The quick brown fox jumps.";
    const wrapped = '<Callout type="warning"><strong>The</strong> quick brown fox jumps.</Callout>';
    expect(readingTimeMinutes(wrapped)).toBe(readingTimeMinutes(bare));
  });

  it("counts a link's label, not its URL", () => {
    const words = "one two three four five ";
    const asLinks = words
      .trim()
      .split(" ")
      .map((word) => `[${word}](https://example.com/a/very/long/path/that/is/not/prose)`)
      .join(" ");
    // 5 words either way — well under a minute, so both floor to 1. Assert on
    // the word-stripping directly by scaling both up past the threshold.
    const many = (text) => text.repeat(90);
    expect(readingTimeMinutes(many(asLinks))).toBe(readingTimeMinutes(many(words)));
  });
});

describe("sortPosts", () => {
  it("orders newest first", () => {
    const posts = [
      post("old", { date: new Date("2026-01-01T00:00:00.000Z") }),
      post("new", { date: new Date("2026-06-01T00:00:00.000Z") }),
    ];
    expect(sortPosts(posts).map((p) => p.slug)).toEqual(["new", "old"]);
  });

  // Stability matters because an unstable order would reshuffle the feed and
  // the sitemap between a local build and CI for no reason.
  it("breaks ties on slug so the order is stable", () => {
    const same = new Date("2026-03-01T00:00:00.000Z");
    const forwards = sortPosts([post("bravo", { date: same }), post("alpha", { date: same })]);
    const backwards = sortPosts([post("alpha", { date: same }), post("bravo", { date: same })]);
    expect(forwards.map((p) => p.slug)).toEqual(["alpha", "bravo"]);
    expect(backwards.map((p) => p.slug)).toEqual(forwards.map((p) => p.slug));
  });

  it("does not mutate its input", () => {
    const posts = [post("b", { date: new Date("2026-01-01") }), post("a", { date: new Date("2026-06-01") })];
    const order = posts.map((p) => p.slug);
    sortPosts(posts);
    expect(posts.map((p) => p.slug)).toEqual(order);
  });
});

describe("filterPublished", () => {
  const posts = [post("live"), post("wip", { draft: true })];

  it("drops drafts by default", () => {
    expect(filterPublished(posts).map((p) => p.slug)).toEqual(["live"]);
  });

  it("keeps drafts when asked", () => {
    expect(filterPublished(posts, { includeDrafts: true })).toHaveLength(2);
  });
});

describe("relatedPosts", () => {
  const subject = post("subject", { tags: ["pdf", "privacy"], tool: "delete-pages" });

  it("never returns the post itself", () => {
    const result = relatedPosts(subject, [subject, post("other", { tags: ["pdf"] })]);
    expect(result.map((p) => p.slug)).not.toContain("subject");
  });

  it("ranks a shared tool above a shared tag above a shared category", () => {
    const all = [
      subject,
      post("same-category", { tags: ["images"] }),
      post("shared-tag", { tags: ["pdf"], category: "explainer" }),
      post("same-tool", { tags: [], category: "explainer", tool: "delete-pages" }),
    ];
    expect(relatedPosts(subject, all).map((p) => p.slug)).toEqual([
      "same-tool",
      "shared-tag",
      "same-category",
    ]);
  });

  it("excludes posts with nothing in common", () => {
    const unrelated = post("unrelated", { tags: ["cooking"], category: "changelog" });
    expect(relatedPosts(subject, [subject, unrelated])).toEqual([]);
  });

  it("respects the limit", () => {
    const all = [subject, ...Array.from({ length: 6 }, (_, i) => post(`p${i}`, { tags: ["pdf"] }))];
    expect(relatedPosts(subject, all, { limit: 2 })).toHaveLength(2);
  });

  it("is deterministic for equally-scored posts", () => {
    const same = new Date("2026-03-01T00:00:00.000Z");
    const a = post("alpha", { tags: ["pdf"], date: same });
    const b = post("bravo", { tags: ["pdf"], date: same });
    expect(relatedPosts(subject, [subject, b, a]).map((p) => p.slug)).toEqual(["alpha", "bravo"]);
  });

  it("handles posts with no tags field at all", () => {
    const untagged = { slug: "x", date: new Date("2026-01-01"), category: "guide" };
    expect(() => relatedPosts(untagged, [untagged, subject])).not.toThrow();
  });
});

describe("collectTags", () => {
  it("counts tags, most-used first", () => {
    const posts = [
      post("a", { tags: ["pdf", "privacy"] }),
      post("b", { tags: ["pdf"] }),
      post("c", { tags: ["images"] }),
    ];
    expect(collectTags(posts)).toEqual([
      { tag: "pdf", count: 2 },
      { tag: "images", count: 1 },
      { tag: "privacy", count: 1 },
    ]);
  });

  it("returns an empty list for untagged posts", () => {
    expect(collectTags([post("a")])).toEqual([]);
  });
});

describe("date formatting", () => {
  const date = new Date("2026-08-13T00:00:00.000Z");

  it("emits an ISO date", () => {
    expect(isoDate(date)).toBe("2026-08-13");
  });

  it("emits a pinned human-readable date", () => {
    expect(displayDate(date)).toBe("13 August 2026");
  });

  // Both formatters must read UTC components, or a build machine west of UTC
  // renders every post a day early. Midnight UTC is exactly where a
  // local-time implementation diverges.
  it("does not shift the day for a midnight-UTC date", () => {
    expect(isoDate(date)).toBe("2026-08-13");
    expect(displayDate(date)).toContain("13");
  });
});
