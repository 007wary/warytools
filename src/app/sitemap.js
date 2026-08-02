import fs from "fs";
import path from "path";

// Auto-discovers every crawlable route by walking src/app for page.js files,
// so adding a new page (tool, hub, or static utility page like /contact)
// shows up here with zero manual edits. Dynamic segments (e.g. s/[code],
// the URL shortener's redirect route) are skipped — they're not real pages
// to list, and [code] isn't a resolvable URL anyway.
function discoverRoutes(dir, baseDir = dir) {
  const routes = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith("[") || entry.name.startsWith("(") || entry.name.startsWith("_")) continue;

    const fullPath = path.join(dir, entry.name);

    if (fs.existsSync(path.join(fullPath, "page.js"))) {
      const route = "/" + path.relative(baseDir, fullPath).split(path.sep).join("/");
      routes.push(route);
    }

    routes.push(...discoverRoutes(fullPath, baseDir));
  }

  return routes;
}

export default function sitemap() {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://warytools.com";
  const appDir = path.join(process.cwd(), "src", "app");

  const routes = ["", ...discoverRoutes(appDir)];

  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
  }));
}
