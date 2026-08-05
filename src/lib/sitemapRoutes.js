// Build-time helpers behind src/app/sitemap.js, kept here (rather than inline
// in the route) so the pure logic is unit-testable — the sitemap route itself
// is only reachable through a full `next build`.
//
// Node-only: this module touches the filesystem and shells out to git. It is
// imported exclusively by sitemap.js, which runs on the server at build time.

import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";

// Route segments that never correspond to a crawlable URL: dynamic segments
// ([code]), route groups ((marketing)), and private folders (_internal).
const NON_ROUTE_PREFIXES = ["[", "(", "_"];

// Auto-discovers every crawlable route by walking src/app for page.js files,
// so adding a new page (tool, hub, or static utility page like /contact)
// shows up here with zero manual edits. Dynamic segments (e.g. s/[code],
// the URL shortener's redirect route) are skipped — they're not real pages
// to list, and [code] isn't a resolvable URL anyway. Routes backed by
// route.js rather than page.js (/api/*, /llms.txt) are likewise not pages.
export function discoverRoutes(dir, baseDir = dir) {
  const routes = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (NON_ROUTE_PREFIXES.some((prefix) => entry.name.startsWith(prefix))) continue;

    const fullPath = path.join(dir, entry.name);

    if (fs.existsSync(path.join(fullPath, "page.js"))) {
      const route = "/" + path.relative(baseDir, fullPath).split(path.sep).join("/");
      routes.push({ route, dir: fullPath });
    }

    routes.push(...discoverRoutes(fullPath, baseDir));
  }

  return routes;
}

// Resolves a `@/...` or relative import specifier to a file on disk.
// Bare specifiers (react, pdf-lib) resolve to null — third-party upgrades
// aren't content changes and shouldn't move a page's lastmod.
function resolveImport(specifier, fromFile, srcDir) {
  let base;
  if (specifier.startsWith("@/")) {
    base = path.join(srcDir, specifier.slice(2));
  } else if (specifier.startsWith(".")) {
    base = path.resolve(path.dirname(fromFile), specifier);
  } else {
    return null;
  }

  for (const candidate of [base, `${base}.js`, `${base}.jsx`, path.join(base, "index.js")]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

const IMPORT_RE = /(?:^|\n)\s*import\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g;

// Every local file a page's rendered output depends on: the page itself plus
// its transitively imported first-party modules.
//
// Used only as a fallback for pages with no git history of their own (see
// buildSitemapEntries). It is intentionally *not* the primary signal: shared
// modules like src/lib/tools.js are imported by nearly every page, so dating
// pages by their imports collapses the whole sitemap onto one timestamp.
export function collectSourceFiles(entryFiles, srcDir) {
  const seen = new Set();
  const queue = [...entryFiles];

  while (queue.length > 0) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);

    let contents;
    try {
      contents = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }

    for (const match of contents.matchAll(IMPORT_RE)) {
      const resolved = resolveImport(match[1], file, srcDir);
      if (resolved && !seen.has(resolved)) queue.push(resolved);
    }
  }

  return [...seen];
}

// Newest git commit date across a set of files, or null when git isn't
// usable (no repo, git absent, or files not yet committed).
//
// Git is the primary signal specifically *because* of CI: a fresh clone
// rewrites every file's mtime to checkout time, so mtimes on Vercel collapse
// to a single build-time constant and tell Google that all pages changed on
// every deploy — which gets lastmod distrusted wholesale. Commit dates are
// stable across clones. Vercel's default checkout keeps commit metadata; the
// mtime path below remains as a fallback for shallow/exportless builds.
export function gitLastModified(files, cwd) {
  let newest = null;

  for (const file of files) {
    try {
      const iso = execFileSync("git", ["log", "-1", "--format=%cI", "--", file], {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      if (!iso) continue;
      const date = new Date(iso);
      if (!Number.isNaN(date.getTime()) && (newest === null || date > newest)) newest = date;
    } catch {
      // git unavailable or file untracked — fall through to the next file.
    }
  }

  return newest;
}

// Fallback when git yields nothing: newest mtime across the same file set.
export function mtimeLastModified(files) {
  let newest = 0;

  for (const file of files) {
    try {
      const { mtimeMs } = fs.statSync(file);
      if (mtimeMs > newest) newest = mtimeMs;
    } catch {
      // Unreadable file — skip it rather than failing the build.
    }
  }

  return newest ? new Date(newest) : null;
}

// Google ignores changefreq entirely and treats priority as at most a weak
// relative hint, so these stay coarse on purpose: homepage, then hub pages
// (one segment), then individual tools and static pages.
export function priorityFor(route) {
  if (route === "/") return 1;
  return route.split("/").filter(Boolean).length === 1 ? 0.8 : 0.6;
}

// The files whose edits should move a route's lastmod. For a tool route
// that's page.js plus its sibling <Name>Client.js (the interactive half).
// The homepage is the exception: its `dir` is src/app itself, so a plain
// directory scan would sweep in robots.js, manifest.js, sitemap.js and other
// siblings that render nothing on the homepage — hence the explicit list.
function entryFilesFor(route, dir) {
  const names = route === "/" ? ["page.js", "layout.js"] : null;

  if (names) {
    return names.map((name) => path.join(dir, name)).filter((file) => fs.existsSync(file));
  }

  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
    .map((entry) => path.join(dir, entry.name));
}

export function buildSitemapEntries({ baseUrl, appDir, srcDir, cwd, now = () => new Date() }) {
  // The homepage lives at the app root itself, so it isn't produced by the
  // directory walk — prepend it explicitly. Its route is "/" rather than ""
  // so the emitted <loc> carries a trailing slash and matches the canonical
  // URL declared in layout.js (`canonical: "/"` against metadataBase); a
  // sitemap/canonical trailing-slash mismatch reads as two distinct URLs.
  const routes = [{ route: "/", dir: appDir }, ...discoverRoutes(appDir)];
  const fallback = now();

  return routes.map(({ route, dir }) => {
    // Deliberately dated from the route's *own* files (page.js and its
    // sibling client component), not from its imports.
    //
    // Following imports transitively is tempting — a tool's copy really does
    // live in src/lib/tools.js — but nearly every page imports tools.js, so
    // one edit there stamps ~20 of 23 URLs with an identical date. That is
    // the same "everything changed at once" signal that makes Google distrust
    // lastmod, just sourced from a shared module instead of a fresh checkout.
    // Per-page dates that occasionally lag a shared-copy tweak are far more
    // useful than dates that move in lockstep.
    const ownFiles = entryFilesFor(route, dir);
    let lastModified = gitLastModified(ownFiles, cwd);

    if (!lastModified) {
      // No git history for the page itself (brand new, or uncommitted, or a
      // build with no git at all). Only here do imports earn their keep, as
      // the sole remaining signal — the lockstep-date risk above is moot when
      // the alternative is no date.
      const withImports = collectSourceFiles(ownFiles, srcDir);
      lastModified =
        gitLastModified(withImports, cwd) || mtimeLastModified(withImports) || fallback;
    }

    return {
      // The homepage route is "/", which would append a trailing slash the
      // canonical tag doesn't have: Next normalizes `canonical: "/"` down to
      // "https://wary.tools". Emitting the bare base URL keeps the sitemap and
      // the canonical declaring the identical string.
      url: route === "/" ? baseUrl : `${baseUrl}${route}`,
      lastModified,
      changeFrequency: route === "/" ? "weekly" : "monthly",
      priority: priorityFor(route),
    };
  });
}
