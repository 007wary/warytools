// Builds the RSS 2.0 feed document for /blog/feed.xml.
//
// Pure string construction, separate from the route so it can be tested —
// same split as sitemapRoutes.js versus sitemap.js. A feed that is malformed
// in one entry is rejected wholesale by most readers with no partial render,
// so the escaping below is the load-bearing part of this file.

// XML escaping for text nodes and attribute values.
//
// All five predefined entities, not just `&` and `<`. A post title containing
// an apostrophe or a quote is entirely ordinary ("What's actually in your
// photo's metadata"), and an unescaped one inside an attribute closes it
// early and invalidates the document. Ampersand must be replaced first or it
// would re-escape the ampersands introduced by the later replacements,
// yielding `&amp;lt;`.
export function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// RSS requires RFC 822 dates, not ISO 8601 — readers that parse strictly
// reject an ISO date, and those that don't often mis-sort the feed.
//
// Built from UTC components with hardcoded English day/month names rather
// than via toUTCString(): the RFC 822 format is defined in English, and
// nothing here should depend on the build machine's locale (the same
// reasoning as displayDate's pinned formatter).
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function rfc822(date) {
  const pad = (n) => String(n).padStart(2, "0");

  return (
    `${DAYS[date.getUTCDay()]}, ${pad(date.getUTCDate())} ${MONTHS[date.getUTCMonth()]} ` +
    `${date.getUTCFullYear()} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:` +
    `${pad(date.getUTCSeconds())} GMT`
  );
}

/**
 * @param {object} args
 * @param {string} args.siteUrl   Base URL, no trailing slash.
 * @param {Array}  args.posts     Posts, newest first.
 * @param {Date}   [args.now]     Injected for deterministic tests.
 */
export function buildRssFeed({ siteUrl, posts, now = new Date() }) {
  const feedUrl = `${siteUrl}/blog/feed.xml`;

  const items = posts
    .map((post) => {
      const url = `${siteUrl}/blog/${post.slug}`;

      // `isPermaLink="true"` on a guid that IS the post URL. Readers use the
      // guid to decide whether an item is new; using the URL means a post
      // whose title is later corrected is not re-delivered as a new item to
      // everyone subscribed.
      return [
        "    <item>",
        `      <title>${escapeXml(post.title)}</title>`,
        `      <link>${escapeXml(url)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(url)}</guid>`,
        `      <description>${escapeXml(post.description)}</description>`,
        `      <pubDate>${rfc822(post.date)}</pubDate>`,
        ...(post.category ? [`      <category>${escapeXml(post.category)}</category>`] : []),
        "    </item>",
      ].join("\n");
    })
    .join("\n");

  // lastBuildDate is the newest post's date, NOT the build time. Stamping the
  // build time makes every deploy look like a feed update to aggregators that
  // poll on it — the same "everything changed at once" signal that
  // sitemapRoutes.js avoids for lastmod, and here it can get a feed
  // deprioritised or flagged as noisy.
  const lastBuild = posts.length > 0 ? posts[0].date : now;

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>WaryTools Blog</title>
    <link>${escapeXml(`${siteUrl}/blog`)}</link>
    <description>Guides, explainers, and release notes from WaryTools.</description>
    <language>en</language>
    <lastBuildDate>${rfc822(lastBuild)}</lastBuildDate>
    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;
}
