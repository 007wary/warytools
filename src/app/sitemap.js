import path from "path";
import { buildBlogSitemapEntries, buildSitemapEntries } from "@/lib/sitemapRoutes";
import { getAllPosts } from "@/lib/blogPosts";
import { SITE_URL } from "@/lib/siteUrl";

// Route discovery and lastmod derivation live in src/lib/sitemapRoutes.js so
// they can be unit-tested; this file only wires in paths and config.
//
// KNOWN BUILD WARNING (expected, not a defect): every `next build` prints
// "Encountered unexpected file in NFT list" pointing here. sitemapRoutes.js
// walks the filesystem and shells out to git from paths built on
// `process.cwd()`, which Turbopack's dependency tracer cannot resolve
// statically, so it conservatively assumes the whole project is a runtime
// dependency of this route. It isn't — the sitemap is fully generated during
// the build and the walk never runs in production. Both documented remedies
// were tried and neither suppresses it (a `turbopackIgnore` comment, which
// only applies to import/require expressions, and `outputFileTracingExcludes`
// for "/sitemap.xml"). Leaving it visible rather than papering over it: the
// output is verified correct (24 URLs with per-page lastmod), and the warning
// costs nothing but a build-log line.

export default function sitemap() {
  const baseUrl = SITE_URL;
  const cwd = process.cwd();
  const srcDir = path.join(cwd, "src");
  const appDir = path.join(srcDir, "app");

  try {
    // Blog posts are appended rather than discovered: they live behind a
    // [slug] segment, which the route walk deliberately skips. See
    // buildBlogSitemapEntries.
    return [
      ...buildSitemapEntries({ baseUrl, appDir, srcDir, cwd }),
      ...buildBlogSitemapEntries({ baseUrl, posts: getAllPosts() }),
    ];
  } catch (error) {
    // A filesystem or git failure during the walk shouldn't fail the whole
    // build. Degrade to the homepage alone: a valid but minimal sitemap is a
    // far better outcome than a broken deploy, and the warning surfaces the
    // cause in the build log.
    console.warn("[sitemap] route discovery failed, emitting homepage only:", error);

    return [
      {
        url: `${baseUrl}/`,
        lastModified: new Date(),
        changeFrequency: "weekly",
        priority: 1,
      },
    ];
  }
}
