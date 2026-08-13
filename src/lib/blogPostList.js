// Pure operations over an already-parsed list of posts: ordering, filtering,
// reading time, and related-post selection.
//
// Kept separate from blogPosts.js (which touches the filesystem) so all of
// this is unit-testable without fixtures on disk — the same split as
// sitemapRoutes.js versus sitemap.js.

// Average adult reading speed for technical prose sits around 200-250 wpm.
// 225 is the middle, and the number only ever feeds a "5 min read" label, so
// precision beyond "roughly right" buys nothing.
const WORDS_PER_MINUTE = 225;

/**
 * Estimated reading time in whole minutes, minimum 1.
 *
 * Counts words in the MDX body with JSX tags and code fences removed. Leaving
 * them in inflates the estimate badly — a post with three embedded components
 * and a long code block reads as twice its actual length, and an obviously
 * wrong "12 min read" on a short post undermines the label everywhere.
 */
export function readingTimeMinutes(body) {
  if (typeof body !== "string") return 1;

  const prose = body
    // Fenced code blocks: skimmed, not read, so they should not dominate.
    .replace(/```[\s\S]*?```/g, " ")
    // JSX/HTML tags — the component markup, not its rendered text.
    .replace(/<[^>]+>/g, " ")
    // Markdown link syntax: keep the label, drop the URL.
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    // Leftover markdown punctuation that would otherwise count as words.
    .replace(/[#*_`>|-]/g, " ");

  const words = prose.split(/\s+/).filter(Boolean).length;

  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

/**
 * Posts newest-first.
 *
 * Ties break on slug so the order is *stable* — two posts sharing a date
 * would otherwise sort by whatever order the directory read returned, which
 * differs between filesystems and would reshuffle the feed (and the sitemap)
 * between a local build and CI for no reason.
 */
export function sortPosts(posts) {
  return [...posts].sort((a, b) => {
    const diff = b.date.getTime() - a.date.getTime();
    return diff !== 0 ? diff : a.slug.localeCompare(b.slug);
  });
}

/**
 * Drops drafts unless explicitly included.
 *
 * `includeDrafts` is driven by NODE_ENV at the call site: drafts render in
 * `next dev` so a post can be previewed, and are absent from the production
 * build entirely — not merely hidden from the index, but not built as a page
 * and not in the sitemap. A draft that is unlisted-but-reachable is a page
 * Google can still find via a stray link.
 */
export function filterPublished(posts, { includeDrafts = false } = {}) {
  return includeDrafts ? posts : posts.filter((post) => !post.draft);
}

/**
 * Posts related to `post`, best-first, capped at `limit`.
 *
 * Scored rather than filtered: a strict "same category AND shared tag" rule
 * returns nothing on a young blog, and an empty related block on every post
 * is worse than an imperfect one. Shared tags weigh more than a shared
 * category because a tag is the more specific signal — two posts tagged `pdf`
 * and `privacy` are genuinely related, whereas two `guide` posts may share
 * nothing but their format.
 */
export function relatedPosts(post, allPosts, { limit = 3 } = {}) {
  const tags = new Set(post.tags || []);

  const scored = allPosts
    .filter((candidate) => candidate.slug !== post.slug)
    .map((candidate) => {
      let score = 0;

      for (const tag of candidate.tags || []) {
        if (tags.has(tag)) score += 3;
      }

      if (candidate.category === post.category) score += 1;

      // Posts about the same tool are strongly related regardless of tags.
      if (post.tool && candidate.tool === post.tool) score += 4;

      return { candidate, score };
    })
    .filter(({ score }) => score > 0);

  // Sort by score, then newest, then slug — the last two keep the result
  // deterministic across builds for the same reason sortPosts does.
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const diff = b.candidate.date.getTime() - a.candidate.date.getTime();
    return diff !== 0 ? diff : a.candidate.slug.localeCompare(b.candidate.slug);
  });

  return scored.slice(0, limit).map(({ candidate }) => candidate);
}

/**
 * Every distinct tag across a set of posts, with counts, most-used first.
 *
 * Used for the tag filter on /blog. Tags are NOT given their own routes: a
 * /blog/tag/<x> page on a blog with four posts is a thin page that competes
 * with the posts themselves for the same query, which is the opposite of what
 * this blog is for. Revisit when a tag has enough posts to justify a page
 * that answers something the posts individually do not.
 */
export function collectTags(posts) {
  const counts = new Map();

  for (const post of posts) {
    for (const tag of post.tags || []) {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.tag.localeCompare(b.tag)));
}

/**
 * ISO date (YYYY-MM-DD) for a post's <time datetime> attribute and JSON-LD.
 *
 * Always formatted from the UTC components. `toLocaleDateString` or any
 * getter-based formatting would shift the date by a day for builds running
 * west of UTC — the same trap parseDate guards on the way in.
 */
export function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

/**
 * Human-readable date, e.g. "13 August 2026".
 *
 * Pinned to en-GB and UTC deliberately. The default locale on a build machine
 * is not the reader's locale — it is Vercel's — so an unpinned format is not
 * "localised", it is arbitrary. Pinning also keeps the prerendered HTML
 * identical between a local build and CI, which an unpinned format would not.
 */
export function displayDate(date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}
