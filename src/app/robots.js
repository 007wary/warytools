import { SITE_URL } from "@/lib/siteUrl";

// Whether this build is serving the canonical production site. Vercel sets
// VERCEL_ENV to "production" | "preview" | "development" automatically; it is
// unset for local builds and non-Vercel hosts, which are treated as canonical
// so `next build && next start` anywhere else still produces a normal
// robots.txt.
function isNonCanonicalDeploy() {
  const env = process.env.VERCEL_ENV;
  return Boolean(env) && env !== "production";
}

export default function robots() {
  // Preview and staging deploys serve a full copy of the site on a
  // *.vercel.app host. Emitting the production "Allow: /" there invites
  // crawlers to index every page on a non-canonical domain — duplicate
  // content competing with wary.tools — and advertises a sitemap of 23
  // canonical URLs from a host that isn't canonical. Canonical tags from
  // metadataBase are only a hint, and Vercel's preview noindex header isn't
  // contractual, so block crawling outright and omit the sitemap entirely.
  if (isNonCanonicalDeploy()) {
    return {
      rules: {
        userAgent: "*",
        disallow: "/",
      },
    };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // /s/ is the shortener's redirect route: crawling it would inflate
      // click counts and index redirect stubs rather than real pages.
      // /api/ has no crawlable content.
      // /newsletter/ holds the token-gated landing pages, which also carry
      // noindex — robots.txt is a request rather than a control, and a
      // disallowed URL can still be indexed from an external link.
      //
      // The operator dashboard is deliberately NOT listed here. robots.txt is
      // world-readable, so naming a deliberately-unguessable path in it
      // publishes the very thing the obscure path was chosen to keep quiet —
      // scanners read robots.txt precisely to harvest interesting paths. It is
      // kept out of the sitemap and carries noindex/nofollow in its own
      // metadata, which is what actually keeps it out of an index; the
      // password and rate limit are what keep people out of it.
      disallow: ["/s/", "/api/", "/newsletter/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
