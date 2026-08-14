// Frontmatter parsing for blog posts.
//
// This is a deliberately small YAML *subset* — scalars, quoted strings, and
// inline `[a, b]` arrays — not a YAML parser, and that is a scope decision
// rather than a shortcut. Real YAML carries anchors, multi-document streams,
// block scalars, and the famous `NO` → false / `1.0` → number coercions; none
// of that is wanted in a post header, and pulling in js-yaml to get it would
// add a dependency to a build-time-only path for no benefit. The tradeoff is
// that anything outside the subset must FAIL LOUDLY, because the alternative
// — silently reading a mistyped header as an empty value — is how a post ships
// with no description and nobody notices until it is indexed that way.
//
// Every parse error throws with the field name and the offending line. These
// run at build time, so a bad post breaks `npm run build` rather than
// rendering a half-empty page in production. That is the intended failure
// mode: a blog post with no title is not a page worth serving.

import { coverAltFor, normalizeCoverPath } from "./blogCover";

// Recognised frontmatter keys and how each is coerced. Anything not listed
// here is rejected — a typo'd `discription:` must not be quietly ignored,
// since the post would then render with no meta description at all and the
// mistake is invisible in the rendered output.
const FIELD_TYPES = {
  title: "string",
  description: "string",
  date: "date",
  updated: "date",
  category: "string",
  tags: "list",
  tool: "string",
  // Root-relative path under /blog/ (i.e. public/blog/). Validated by
  // blogCover.js, and its existence on disk checked in blogPosts.js — a
  // cover naming a file that isn't there fails the build rather than
  // serving a broken image.
  cover: "string",
  coverAlt: "string",
  author: "string",
  draft: "boolean",
  featured: "boolean",
};

const REQUIRED_FIELDS = ["title", "description", "date", "category"];

// The post categories. One stream at /blog carries all of these; the category
// is a filter and a badge, not a separate route, so a reader following the
// blog sees guides and release notes in one feed.
export const CATEGORIES = {
  guide: {
    label: "Guide",
    // Guides are how-to content targeting a task ("how to remove a page from
    // a PDF"). They get HowTo-flavoured intros and a tool CTA.
    description: "Step-by-step walkthroughs for getting a job done.",
  },
  explainer: {
    label: "Explainer",
    description: "How a format or a technique actually works, and why it matters.",
  },
  announcement: {
    label: "Announcement",
    description: "New tools and notable additions to the site.",
  },
  changelog: {
    label: "Changelog",
    description: "Fixes, improvements, and smaller changes.",
  },
};

export class FrontmatterError extends Error {
  constructor(message, { file } = {}) {
    super(file ? `${file}: ${message}` : message);
    this.name = "FrontmatterError";
    this.file = file;
  }
}

// Splits a raw .mdx file into its frontmatter block and body.
//
// The delimiter must be exactly `---` on its own line, and the file must open
// with it. A missing opening delimiter is an error rather than "treat the
// whole file as body": a post whose header failed to parse would otherwise
// render with the raw YAML as its first paragraph, which looks like content
// and reads as broken.
export function splitFrontmatter(raw, file) {
  if (typeof raw !== "string") {
    throw new FrontmatterError("file contents are not a string", { file });
  }

  // Tolerate a UTF-8 BOM and leading blank lines; editors add both, and
  // neither is a real authoring mistake.
  const text = raw.replace(/^﻿/, "").replace(/^\s*\n/, "");

  if (!text.startsWith("---")) {
    throw new FrontmatterError("missing opening --- frontmatter delimiter", { file });
  }

  // Find the closing delimiter: a line that is exactly `---`. Searching for
  // the literal string would match a `---` horizontal rule inside the body
  // of a post that had no closing delimiter, silently swallowing prose into
  // the header.
  const lines = text.split(/\r?\n/);
  let closingIndex = -1;

  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === "---") {
      closingIndex = i;
      break;
    }
  }

  if (closingIndex === -1) {
    throw new FrontmatterError("missing closing --- frontmatter delimiter", { file });
  }

  return {
    frontmatter: lines.slice(1, closingIndex).join("\n"),
    body: lines.slice(closingIndex + 1).join("\n").replace(/^\s*\n/, ""),
  };
}

// Strips one layer of matching quotes. Unquoted values are returned as-is,
// so `title: Merge PDFs` works without ceremony.
function unquote(value) {
  const trimmed = value.trim();
  if (trimmed.length < 2) return trimmed;

  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];

  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

// Dates are required to be plain `YYYY-MM-DD`, and parsed as UTC.
//
// `new Date("2026-08-13")` is already UTC, but `new Date("2026-08-13
// 10:00")` is *local* — so accepting a looser format would make a post's
// displayed date depend on the timezone of whichever machine ran the build.
// A post dated the 13th appearing as the 12th to half the world is the exact
// class of silent, timezone-shaped bug this refuses to allow in.
function parseDate(value, field, file) {
  const text = unquote(value);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new FrontmatterError(
      `\`${field}\` must be a plain YYYY-MM-DD date, got "${text}"`,
      { file },
    );
  }

  const date = new Date(`${text}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    throw new FrontmatterError(`\`${field}\` is not a real date: "${text}"`, { file });
  }

  // Round-trip check catches calendar-invalid dates that Date happily rolls
  // over — "2026-02-30" becomes March 2nd rather than throwing.
  if (date.toISOString().slice(0, 10) !== text) {
    throw new FrontmatterError(`\`${field}\` is not a real calendar date: "${text}"`, { file });
  }

  return date;
}

function parseList(value, field, file) {
  const text = value.trim();

  if (!text.startsWith("[") || !text.endsWith("]")) {
    throw new FrontmatterError(
      `\`${field}\` must be an inline list like [a, b], got "${text}"`,
      { file },
    );
  }

  const inner = text.slice(1, -1).trim();
  if (inner === "") return [];

  return inner
    .split(",")
    .map((item) => unquote(item))
    .filter((item) => item !== "");
}

function parseBoolean(value, field, file) {
  const text = unquote(value).toLowerCase();
  if (text === "true") return true;
  if (text === "false") return false;
  throw new FrontmatterError(`\`${field}\` must be true or false, got "${text}"`, { file });
}

/**
 * Parses a frontmatter block into a typed object.
 *
 * Unknown keys throw rather than being dropped. See the FIELD_TYPES comment:
 * a silently ignored typo is worse than a failed build.
 */
export function parseFrontmatter(block, file) {
  const data = {};

  for (const rawLine of block.split(/\r?\n/)) {
    const line = rawLine.trim();

    // Blank lines and `#` comments are allowed inside the header.
    if (line === "" || line.startsWith("#")) continue;

    const separator = line.indexOf(":");
    if (separator === -1) {
      throw new FrontmatterError(`frontmatter line is not \`key: value\`: "${line}"`, { file });
    }

    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();

    if (!Object.hasOwn(FIELD_TYPES, key)) {
      throw new FrontmatterError(
        `unknown frontmatter key \`${key}\` (allowed: ${Object.keys(FIELD_TYPES).join(", ")})`,
        { file },
      );
    }

    if (Object.hasOwn(data, key)) {
      throw new FrontmatterError(`duplicate frontmatter key \`${key}\``, { file });
    }

    if (value === "") {
      throw new FrontmatterError(`\`${key}\` has no value`, { file });
    }

    switch (FIELD_TYPES[key]) {
      case "date":
        data[key] = parseDate(value, key, file);
        break;
      case "list":
        data[key] = parseList(value, key, file);
        break;
      case "boolean":
        data[key] = parseBoolean(value, key, file);
        break;
      default:
        data[key] = unquote(value);
    }
  }

  for (const field of REQUIRED_FIELDS) {
    if (!Object.hasOwn(data, field)) {
      throw new FrontmatterError(`missing required frontmatter field \`${field}\``, { file });
    }
  }

  if (!Object.hasOwn(CATEGORIES, data.category)) {
    throw new FrontmatterError(
      `unknown category "${data.category}" (allowed: ${Object.keys(CATEGORIES).join(", ")})`,
      { file },
    );
  }

  // The description is the meta description and the card excerpt. Google
  // truncates around 155-160 characters, so a longer one is not an error but
  // a shorter-than-useful one usually means a placeholder was left in.
  if (data.description.length < 50) {
    throw new FrontmatterError(
      `\`description\` is only ${data.description.length} characters — it is the meta description, aim for 120-160`,
      { file },
    );
  }

  if (data.updated && data.updated < data.date) {
    throw new FrontmatterError("`updated` is earlier than `date`", { file });
  }

  if (data.cover) {
    data.cover = normalizeCoverPath(data.cover, file);
    // Throws when coverAlt is missing. Deliberately not defaulted to the
    // title — see coverAltFor.
    data.coverAlt = coverAltFor(data, file);
  } else if (data.coverAlt) {
    // Alt text with no image is a stale leftover from a removed cover, and
    // silently ignoring it means the next person to add one inherits a
    // description of a different picture.
    throw new FrontmatterError("`coverAlt` is set but `cover` is not", { file });
  }

  return data;
}

// Slugs that would be shadowed by a real route under /blog, so a post
// claiming one is unreachable.
//
// `page` is the index pagination route (/blog/page/2). Next resolves a literal
// segment ahead of the sibling [slug] segment, so `page.mdx` would build a
// page at /blog/page that the router never serves — no error, no warning, and
// the post is in the sitemap and the RSS feed pointing at a URL that renders
// the pagination route instead. `feed.xml` is the RSS route for the same
// reason, and cannot be a slug anyway (a dot fails the kebab-case check), but
// it is listed so the reason is recorded in one place.
const RESERVED_SLUGS = new Set(["page", "feed"]);

// A post's slug comes from its filename, never from frontmatter.
//
// Two sources for one identity is how you get a file called
// `merge-pdfs.mdx` serving at `/blog/how-to-merge-pdfs` — findable by neither
// name. The filename is the URL; renaming the file is the (deliberate,
// redirect-requiring) act of moving the post.
export function slugFromFilename(filename) {
  const base = filename.replace(/\.mdx?$/i, "");

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(base)) {
    throw new FrontmatterError(
      `post filename "${filename}" must be lowercase kebab-case (letters, digits, single hyphens)`,
    );
  }

  if (RESERVED_SLUGS.has(base)) {
    throw new FrontmatterError(
      `post filename "${filename}" uses the reserved slug "${base}" — /blog/${base} is already a route, so the post would never be reachable. Rename the file.`,
    );
  }

  return base;
}
