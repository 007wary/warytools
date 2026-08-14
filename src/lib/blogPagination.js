// Pagination for the /blog index.
//
// Pure arithmetic over an already-sorted post list, kept out of the page
// components for the same reason everything else in blogPostList.js is: it is
// the part that can be wrong in ways a rendered page does not reveal. An
// off-by-one here does not throw — it silently drops one post out of the index
// entirely, which is invisible on the page (the list still looks like a list)
// and only surfaces when someone goes looking for an article that is in the
// sitemap, in the feed, and reachable at its own URL, but listed nowhere.
//
// Node-safe and DOM-free: imported from server components, sitemap.js, and the
// [page] route's generateStaticParams.

/**
 * Posts per index page.
 *
 * 10 rather than 6 or 20. Six would push a second page into existence while
 * the blog is still small enough that one screen of scrolling shows
 * everything — paginating four posts into two pages is worse than not
 * paginating, because it hides content behind a click for no gain. Twenty
 * makes the phone experience a very long scroll with the newsletter card
 * stranded far below the fold.
 *
 * At 10, page 2 first exists at post 11. Changing this number is safe at any
 * time EXCEPT that it reshuffles which posts sit on which page, so URLs like
 * /blog/page/2 come to mean a different set. That is acceptable for an index
 * (these pages are navigational, and each carries a canonical to itself) but
 * it is the reason the number lives here, named, rather than inline.
 */
export const POSTS_PER_PAGE = 10;

/**
 * The URL path for a given index page.
 *
 * Page 1 is "/blog", NEVER "/blog/page/1". A blog that serves its first page
 * at two URLs is competing with itself: both carry the same ten posts, both
 * are crawlable, and Google picks one — often not the one every internal link
 * points at. So page 1 has exactly one address, and the [page] route refuses
 * "1" outright rather than rendering a duplicate of /blog.
 */
export function blogPagePath(page) {
  return page <= 1 ? "/blog" : `/blog/page/${page}`;
}

/**
 * Total number of index pages for `total` posts, minimum 1.
 *
 * An empty blog still has one page — the /blog index with its empty state.
 * Returning 0 would make the index itself out-of-range and 404 the only page
 * that can explain there are no posts yet.
 */
export function totalPages(total, perPage = POSTS_PER_PAGE) {
  return Math.max(1, Math.ceil(total / perPage));
}

/**
 * Parses a `page` route segment into a page number, or null if it is not a
 * valid page for this route.
 *
 * Deliberately strict, because this is untrusted input that decides whether a
 * URL exists: "2" is page 2, but "02", "2.0", " 2", "2abc", "-1", "1e1" and
 * "" are all null. Number() accepts most of those and would mint a second,
 * crawlable URL for a page that already has one — the duplicate-content
 * problem blogPagePath exists to avoid, arriving through the back door.
 *
 * "1" is rejected too, and that is the point rather than an oversight: page 1
 * lives at /blog. Callers turn a null into notFound().
 */
export function parsePageParam(value) {
  if (typeof value !== "string") return null;
  // Anchored, digits only, no leading zero. Rejects the whitespace and
  // exponent forms Number() would otherwise accept.
  if (!/^[1-9][0-9]*$/.test(value)) return null;

  const page = Number(value);

  // Guard the range Number can represent but the arithmetic below cannot use
  // meaningfully. Not reachable through totalPages, but this function is the
  // boundary and should not hand a caller an unusable number.
  if (!Number.isSafeInteger(page)) return null;

  // Page 1 is /blog. See blogPagePath.
  return page === 1 ? null : page;
}

/**
 * Slices `posts` for `page` and returns the navigation state around it.
 *
 * Returns null when the page is out of range, so the caller can 404 rather
 * than render an empty index. An out-of-range page rendering as "no posts"
 * would be a soft 404: a real 200 response, indexable, saying nothing.
 *
 * `posts` must already be sorted — this does not reorder, so the caller's
 * ordering (newest-first, from sortPosts) is what page boundaries are drawn
 * against.
 */
export function paginatePosts(posts, page, perPage = POSTS_PER_PAGE) {
  const all = Array.isArray(posts) ? posts : [];
  const pages = totalPages(all.length, perPage);

  if (!Number.isSafeInteger(page) || page < 1 || page > pages) return null;

  const start = (page - 1) * perPage;

  return {
    posts: all.slice(start, start + perPage),
    page,
    totalPages: pages,
    // Absolute position of the first post on this page, 1-based, for the
    // "Showing 11-20 of 34" line. Zero-length only on an empty blog.
    from: all.length === 0 ? 0 : start + 1,
    to: Math.min(start + perPage, all.length),
    total: all.length,
    previousPath: page > 1 ? blogPagePath(page - 1) : null,
    nextPath: page < pages ? blogPagePath(page + 1) : null,
  };
}

/**
 * Every page number that needs a static route built, EXCLUDING page 1.
 *
 * Page 1 is /blog and is its own route, so including it here would build a
 * second copy at /blog/page/1 — the duplicate this module refuses everywhere
 * else. Returns [] while the blog fits on one page, which is the correct
 * generateStaticParams result: the /blog/page/[page] route then builds
 * nothing and, with dynamicParams false, 404s every request to it.
 */
export function paginationParams(total, perPage = POSTS_PER_PAGE) {
  const pages = totalPages(total, perPage);
  const params = [];

  for (let page = 2; page <= pages; page += 1) {
    params.push(String(page));
  }

  return params;
}
