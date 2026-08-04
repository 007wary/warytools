import path from "path";
import { buildSitemapEntries } from "@/lib/sitemapRoutes";
import { SITE_URL } from "@/lib/siteUrl";

// Route discovery and lastmod derivation live in src/lib/sitemapRoutes.js so
// they can be unit-tested; this file only wires in paths and config.

export default function sitemap() {
  const baseUrl = SITE_URL;
  const cwd = process.cwd();
  const srcDir = path.join(cwd, "src");
  const appDir = path.join(srcDir, "app");

  try {
    return buildSitemapEntries({ baseUrl, appDir, srcDir, cwd });
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
