// Reads the blog's .mdx files off disk and turns them into post records.
//
// Node-only: this touches the filesystem, exactly like sitemapRoutes.js. It is
// imported only from server components and build-time routes (the /blog index,
// the [slug] page, sitemap.js, and the RSS feed), never from a client
// component — importing it into one would fail the build, which is the
// intended guard rather than a hazard.
//
// Everything pure lives in blogFrontmatter.js and blogPostList.js so it can be
// tested without fixtures on disk; this module is the thin I/O shell around
// them.

import fs from "fs";
import path from "path";
import { parseFrontmatter, slugFromFilename, splitFrontmatter } from "./blogFrontmatter";
import { filterPublished, readingTimeMinutes, sortPosts } from "./blogPostList";

export const BLOG_DIR = path.join(process.cwd(), "src", "content", "blog");

// Drafts render in `next dev` so a post can be previewed at its real URL, and
// are absent from a production build entirely — not built, not linked, not in
// the sitemap. "Unlisted but reachable" is not a draft; it is a published page
// nobody proofread.
const INCLUDE_DRAFTS = process.env.NODE_ENV === "development";

/**
 * Reads and parses every post. Cached per-process.
 *
 * The cache matters because Next calls generateStaticParams, then
 * generateMetadata and the page component once per post, then sitemap.js and
 * the feed — so an uncached implementation re-reads and re-parses the whole
 * directory O(n) times per build. It is safe precisely because this only runs
 * at build time: there is no request during which a file could change. In
 * `next dev` the module is re-evaluated on change, so edits still show up.
 */
let cache = null;

export function getAllPosts() {
  if (cache) return cache;

  // A missing directory is not an error — it is a site with no posts yet, and
  // the /blog index handles the empty case. Throwing here would break the
  // build for anyone checking out the repo before the first post lands.
  if (!fs.existsSync(BLOG_DIR)) {
    cache = [];
    return cache;
  }

  const posts = fs
    .readdirSync(BLOG_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.mdx$/i.test(entry.name))
    .map((entry) => {
      const filename = entry.name;
      const raw = fs.readFileSync(path.join(BLOG_DIR, filename), "utf8");

      // Any parse failure throws with the filename attached and fails the
      // build. See blogFrontmatter.js — a post with a broken header should
      // never reach production, because its breakage (an empty description, a
      // missing date) is invisible in the rendered page.
      const { frontmatter, body } = splitFrontmatter(raw, filename);
      const data = parseFrontmatter(frontmatter, filename);

      return {
        ...data,
        slug: slugFromFilename(filename),
        filename,
        draft: data.draft ?? false,
        featured: data.featured ?? false,
        tags: data.tags ?? [],
        readingTime: readingTimeMinutes(body),
      };
    });

  cache = sortPosts(filterPublished(posts, { includeDrafts: INCLUDE_DRAFTS }));
  return cache;
}

export function getPostSlugs() {
  return getAllPosts().map((post) => post.slug);
}

export function getPostBySlug(slug) {
  return getAllPosts().find((post) => post.slug === slug) || null;
}
