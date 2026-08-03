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

  const routes = ["", ...discoverRoutes(appDir)];

  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    changeFrequency: route === "" ? "weekly" : "monthly",
    priority: priorityFor(route),
  }));
}
