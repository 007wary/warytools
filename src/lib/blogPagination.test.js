import { describe, expect, it } from "vitest";
import {
  POSTS_PER_PAGE,
  blogPagePath,
  paginatePosts,
  paginationParams,
  parsePageParam,
  totalPages,
} from "./blogPagination";

// Post records only need what pagination touches.
const post = (slug) => ({ slug, title: slug });
const posts = (count) => Array.from({ length: count }, (_, i) => post(`post-${i + 1}`));

describe("blogPagePath", () => {
  it("serves page 1 at /blog, never /blog/page/1", () => {
    // The duplicate-content rule the whole module is built around: two
    // crawlable URLs holding the same posts compete for the same query.
    expect(blogPagePath(1)).toBe("/blog");
    expect(blogPagePath(0)).toBe("/blog");
  });

  it("serves later pages under /blog/page", () => {
    expect(blogPagePath(2)).toBe("/blog/page/2");
    expect(blogPagePath(17)).toBe("/blog/page/17");
  });
});

describe("totalPages", () => {
  it("floors at 1 so an empty blog still has an index", () => {
    // Returning 0 would put /blog itself out of range and 404 the only page
    // that can say "no posts yet".
    expect(totalPages(0)).toBe(1);
  });

  it("does not open a second page until the first overflows", () => {
    expect(totalPages(POSTS_PER_PAGE)).toBe(1);
    expect(totalPages(POSTS_PER_PAGE + 1)).toBe(2);
  });

  it("counts a partial final page", () => {
    expect(totalPages(21, 10)).toBe(3);
    expect(totalPages(30, 10)).toBe(3);
  });
});

describe("parsePageParam", () => {
  it("accepts plain page numbers from 2 up", () => {
    expect(parsePageParam("2")).toBe(2);
    expect(parsePageParam("104")).toBe(104);
  });

  it("rejects 1, because page 1 lives at /blog", () => {
    expect(parsePageParam("1")).toBeNull();
  });

  it.each([
    ["02", "leading zero"],
    ["2.0", "decimal"],
    [" 2", "leading space"],
    ["2 ", "trailing space"],
    ["2abc", "trailing junk"],
    ["1e1", "exponent"],
    ["-1", "negative"],
    ["0", "zero"],
    ["+2", "signed"],
    ["", "empty"],
    ["²", "superscript digit"],
  ])("rejects %s (%s)", (value) => {
    // Every one of these is something Number() or parseInt would happily
    // accept, minting a second crawlable URL for a page that already has one.
    expect(parsePageParam(value)).toBeNull();
  });

  it("rejects non-strings", () => {
    expect(parsePageParam(2)).toBeNull();
    expect(parsePageParam(undefined)).toBeNull();
    expect(parsePageParam(null)).toBeNull();
    expect(parsePageParam(["2"])).toBeNull();
  });

  it("rejects a number too large to be a safe integer", () => {
    expect(parsePageParam("99999999999999999999")).toBeNull();
  });
});

describe("paginatePosts", () => {
  it("returns the whole list when it fits on one page", () => {
    const result = paginatePosts(posts(4), 1, 10);

    expect(result.posts).toHaveLength(4);
    expect(result.totalPages).toBe(1);
    expect(result.previousPath).toBeNull();
    expect(result.nextPath).toBeNull();
  });

  it("slices the requested page and links both ways from the middle", () => {
    const result = paginatePosts(posts(25), 2, 10);

    expect(result.posts.map((p) => p.slug)).toEqual([
      "post-11", "post-12", "post-13", "post-14", "post-15",
      "post-16", "post-17", "post-18", "post-19", "post-20",
    ]);
    expect(result.previousPath).toBe("/blog");
    expect(result.nextPath).toBe("/blog/page/3");
  });

  it("links back to /blog rather than /blog/page/1 from page 2", () => {
    expect(paginatePosts(posts(25), 2, 10).previousPath).toBe("/blog");
  });

  it("has no next link on the last page", () => {
    const result = paginatePosts(posts(25), 3, 10);

    expect(result.posts).toHaveLength(5);
    expect(result.nextPath).toBeNull();
    expect(result.previousPath).toBe("/blog/page/2");
  });

  it("reports a 1-based, inclusive position range", () => {
    expect(paginatePosts(posts(25), 1, 10)).toMatchObject({ from: 1, to: 10, total: 25 });
    expect(paginatePosts(posts(25), 2, 10)).toMatchObject({ from: 11, to: 20, total: 25 });
    // The last page is short, so `to` is the total rather than page * perPage.
    expect(paginatePosts(posts(25), 3, 10)).toMatchObject({ from: 21, to: 25, total: 25 });
  });

  it("returns null out of range rather than an empty list", () => {
    // An empty index at a 200 response is a soft 404 — indexable, and saying
    // nothing. The caller turns null into a real 404.
    expect(paginatePosts(posts(25), 4, 10)).toBeNull();
    expect(paginatePosts(posts(25), 0, 10)).toBeNull();
    expect(paginatePosts(posts(25), -1, 10)).toBeNull();
    expect(paginatePosts(posts(25), 1.5, 10)).toBeNull();
  });

  it("renders page 1 of an empty blog rather than 404ing it", () => {
    const result = paginatePosts([], 1, 10);

    expect(result).not.toBeNull();
    expect(result.posts).toEqual([]);
    expect(result.from).toBe(0);
    expect(result.to).toBe(0);
    expect(result.nextPath).toBeNull();
  });

  it("tolerates a missing list", () => {
    expect(paginatePosts(undefined, 1, 10).posts).toEqual([]);
  });

  it("preserves the caller's order rather than re-sorting", () => {
    // Page boundaries are drawn against the order sortPosts produced. A
    // re-sort here would silently reorder the index relative to the feed.
    const given = [post("c"), post("a"), post("b")];
    expect(paginatePosts(given, 1, 10).posts.map((p) => p.slug)).toEqual(["c", "a", "b"]);
  });

  // The assertion that actually protects the index: every post must appear on
  // exactly one page, with none dropped and none duplicated. An off-by-one in
  // the slice does not throw — it silently removes a post from the index while
  // leaving it in the sitemap, the feed, and reachable at its own URL.
  it.each([0, 1, 9, 10, 11, 25, 100, 101])(
    "covers all %i posts exactly once across every page",
    (count) => {
      const all = posts(count);
      const pages = totalPages(count, 10);
      const seen = [];

      for (let page = 1; page <= pages; page += 1) {
        const result = paginatePosts(all, page, 10);
        expect(result).not.toBeNull();
        seen.push(...result.posts.map((p) => p.slug));
      }

      expect(seen).toEqual(all.map((p) => p.slug));
      expect(new Set(seen).size).toBe(count);
    },
  );

  it("walks the whole archive by following nextPath", () => {
    // Round-trip through the navigation the reader actually uses, rather than
    // recomputing the arithmetic: if nextPath and the slice disagree, this
    // fails where a per-page arithmetic check would not.
    const all = posts(34);
    const visited = [];
    let path = "/blog";

    while (path) {
      const page = path === "/blog" ? 1 : Number(path.split("/").pop());
      const result = paginatePosts(all, page, 10);
      visited.push(...result.posts.map((p) => p.slug));
      path = result.nextPath;
    }

    expect(visited).toEqual(all.map((p) => p.slug));
  });
});

describe("paginationParams", () => {
  it("builds nothing while the blog fits on one page", () => {
    // With dynamicParams false, the [page] route then 404s every request —
    // which is correct, since no such page exists.
    expect(paginationParams(0, 10)).toEqual([]);
    expect(paginationParams(10, 10)).toEqual([]);
  });

  it("never builds page 1, which would duplicate /blog", () => {
    expect(paginationParams(100, 10)).not.toContain("1");
  });

  it("builds every page from 2 to the last, as strings", () => {
    expect(paginationParams(34, 10)).toEqual(["2", "3", "4"]);
  });

  it("builds exactly the pages paginatePosts accepts", () => {
    const count = 47;
    const all = posts(count);

    for (const param of paginationParams(count, 10)) {
      const page = parsePageParam(param);
      expect(page).not.toBeNull();
      expect(paginatePosts(all, page, 10)).not.toBeNull();
    }

    // And one past the end is not built.
    expect(paginationParams(count, 10)).not.toContain(String(totalPages(count, 10) + 1));
  });
});
