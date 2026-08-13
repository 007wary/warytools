// Cover-image rules for blog posts.
//
// A post declares its cover in frontmatter:
//
//   cover: /blog/delete-pages.jpg
//   coverAlt: A PDF page grid with two pages marked for deletion
//
// The file lives in `public/blog/`. Everything here is pure so it can be
// tested; the existence check that needs the filesystem lives in
// blogPosts.js, which is already the Node-only shell.

// Formats a browser will reliably render inline. SVG is deliberately absent:
// it can carry script, and these are also served to social crawlers and
// declared in JSON-LD, where a vector of unknown provenance is a liability
// rather than a convenience. AVIF is absent because several social crawlers
// still cannot decode it — a cover that renders on the site but breaks the
// share preview is worse than one that is merely larger.
export const ALLOWED_COVER_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

// og:image is the binding constraint on dimensions. Facebook, LinkedIn and X
// all want 1200x630 (1.91:1); Google's article guidance wants at least 1200px
// wide. Anything smaller gets downgraded to a small summary card or dropped
// from a rich result, silently — the post still shares, it just shares badly,
// which nobody notices without checking a debugger.
export const COVER_WIDTH = 1200;
export const COVER_HEIGHT = 630;

export class CoverError extends Error {
  constructor(message, { file } = {}) {
    super(file ? `${file}: ${message}` : message);
    this.name = "CoverError";
    this.file = file;
  }
}

/**
 * Validates a `cover:` value and returns its path under public/.
 *
 * Root-relative only. A remote URL is refused rather than passed through:
 * next/image would need the host allowlisted in next.config, the file would
 * be outside version control, and the site's whole premise is not depending
 * on someone else's server to render a page.
 */
export function normalizeCoverPath(cover, file) {
  if (typeof cover !== "string" || cover.trim() === "") {
    throw new CoverError("`cover` must be a non-empty path", { file });
  }

  const value = cover.trim();

  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith("//")) {
    throw new CoverError(
      `\`cover\` must be a root-relative path under /blog/, not a URL ("${value}")`,
      { file },
    );
  }

  if (!value.startsWith("/blog/")) {
    throw new CoverError(
      `\`cover\` must start with /blog/ (got "${value}") — covers live in public/blog/`,
      { file },
    );
  }

  // `..` would escape public/blog and, more importantly, would be resolved
  // differently by next/image than by the build-time existence check — so the
  // check could pass against one file while the page served another.
  if (value.includes("..")) {
    throw new CoverError("`cover` must not contain `..`", { file });
  }

  const extension = value.slice(value.lastIndexOf(".")).toLowerCase();

  if (!ALLOWED_COVER_EXTENSIONS.includes(extension)) {
    throw new CoverError(
      `\`cover\` must be one of ${ALLOWED_COVER_EXTENSIONS.join(", ")} (got "${extension}")`,
      { file },
    );
  }

  return value;
}

/**
 * The alt text for a post's cover.
 *
 * Required whenever a cover is set, and deliberately NOT defaulted to the
 * post title. A cover that repeats the headline is decorative, and alt text
 * echoing the adjacent `<h1>` makes a screen reader announce the same
 * sentence twice — actively worse than a decorative image with `alt=""`.
 * Forcing the author to write it is the only way to get a description of the
 * *picture* rather than of the post.
 */
export function coverAltFor(post, file) {
  if (!post.cover) return null;

  if (!post.coverAlt || post.coverAlt.trim() === "") {
    throw new CoverError(
      "a post with `cover` must also set `coverAlt` describing the image (not the post title)",
      { file },
    );
  }

  return post.coverAlt.trim();
}

/**
 * The absolute URL for og:image / JSON-LD, or null when a post has no cover.
 *
 * Social crawlers and schema.org both require absolute URLs — a root-relative
 * path is silently ignored by most of them, which reads as "no image" rather
 * than as an error.
 */
export function coverImageUrl(post, siteUrl) {
  return post.cover ? `${siteUrl}${post.cover}` : null;
}
