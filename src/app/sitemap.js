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
      routes.push({ route, dir: fullPath });
    }

    routes.push(...discoverRoutes(fullPath, baseDir));
  }

  return routes;
}

// Newest mtime across the files that make up a route. A tool page's content
// lives in both page.js (copy/metadata) and its sibling <Name>Client.js (the
// actual tool), so an edit to either should move the date — timestamping only
// page.js would under-report changes to the interactive half.
//
// Deliberately not derived from git: Vercel builds from a shallow clone, so
// commit dates aren't reliably available and would silently degrade to a
// constant. File mtimes are the honest signal inside the build sandbox.
function lastModifiedFor(dir) {
  let newest = 0;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".js")) continue;
    const { mtimeMs } = fs.statSync(path.join(dir, entry.name));
    if (mtimeMs > newest) newest = mtimeMs;
  }

  return newest ? new Date(newest) : new Date();
}

// Rough priority/change-frequency by route depth: homepage highest, hub
// pages next, individual tools and static pages below that.
function priorityFor(route) {
  if (route === "") return 1;
  const segments = route.split("/").filter(Boolean);
  if (segments.length === 1) return 0.8;
  return 0.6;
}

export default function sitemap() {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://wary.tools";
  const appDir = path.join(process.cwd(), "src", "app");

  // The homepage lives at the app root itself, so it isn't produced by the
  // directory walk — prepend it explicitly.
  const routes = [{ route: "", dir: appDir }, ...discoverRoutes(appDir)];

  return routes.map(({ route, dir }) => ({
    url: `${baseUrl}${route}`,
    lastModified: lastModifiedFor(dir),
    changeFrequency: route === "" ? "weekly" : "monthly",
    priority: priorityFor(route),
  }));
}
