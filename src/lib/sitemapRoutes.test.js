import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  discoverRoutes,
  collectSourceFiles,
  mtimeLastModified,
  priorityFor,
  buildSitemapEntries,
} from "./sitemapRoutes";

// A miniature src/ tree mirroring the real app's shape: hub pages, nested
// tool routes, a dynamic segment, a route group, a private folder, a
// route.js-only endpoint, and shared lib/component modules that pages import.
const FIXTURE = {
  "lib/tools.js": "export const categories = [];",
  "lib/theme.js": "export const colors = {};",
  "components/ToolCard.js": 'import { colors } from "@/lib/theme";\nexport default function ToolCard() {}',
  "app/page.js": 'import { categories } from "@/lib/tools";\nexport default function Home() {}',
  "app/layout.js": "export default function Layout() {}",
  "app/robots.js": "export default function robots() {}",
  "app/manifest.js": "export default function manifest() {}",
  "app/pdf/page.js": 'import ToolCard from "@/components/ToolCard";\nexport default function Hub() {}',
  "app/pdf/merge/page.js": 'import MergeClient from "./MergeClient";\nexport default function Page() {}',
  "app/pdf/merge/MergeClient.js": '"use client";\nimport { categories } from "@/lib/tools";',
  "app/contact/page.js": "export default function Contact() {}",
  "app/s/[code]/page.js": "export default function Redirect() {}",
  "app/(marketing)/promo/page.js": "export default function Promo() {}",
  "app/_internal/helper/page.js": "export default function Helper() {}",
  "app/api/shorten/route.js": "export function POST() {}",
  // Real pages that must never be listed: they do nothing without a signed
  // token from an email, so a crawler finds only "this link is invalid".
  "app/newsletter/confirm/page.js": "export default function Confirm() {}",
  "app/newsletter/unsubscribe/page.js": "export default function Unsub() {}",
  "app/newsletter/resubscribe/page.js": "export default function Resub() {}",
};

let tmpDir, srcDir, appDir;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sitemap-test-"));
  srcDir = path.join(tmpDir, "src");
  appDir = path.join(srcDir, "app");

  for (const [relative, contents] of Object.entries(FIXTURE)) {
    const target = path.join(srcDir, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  }
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("discoverRoutes", () => {
  it("finds nested tool routes and hub pages", () => {
    const routes = discoverRoutes(appDir).map((entry) => entry.route);
    expect(routes).toContain("/pdf");
    expect(routes).toContain("/pdf/merge");
    expect(routes).toContain("/contact");
  });

  it("skips dynamic segments, route groups, and private folders", () => {
    const routes = discoverRoutes(appDir).map((entry) => entry.route);
    expect(routes.some((route) => route.includes("["))).toBe(false);
    expect(routes.some((route) => route.includes("(")).valueOf()).toBe(false);
    expect(routes.some((route) => route.includes("_internal"))).toBe(false);
  });

  it("skips route.js endpoints that are not pages", () => {
    const routes = discoverRoutes(appDir).map((entry) => entry.route);
    expect(routes).not.toContain("/api/shorten");
  });

  it("does not include the homepage (callers prepend it)", () => {
    const routes = discoverRoutes(appDir).map((entry) => entry.route);
    expect(routes).not.toContain("");
    expect(routes).not.toContain("/");
  });
});

describe("collectSourceFiles", () => {
  it("follows @/ imports into shared lib modules", () => {
    const files = collectSourceFiles([path.join(appDir, "page.js")], srcDir);
    expect(files).toContain(path.join(srcDir, "lib", "tools.js"));
  });

  it("follows relative sibling imports (page.js -> Client.js)", () => {
    const files = collectSourceFiles([path.join(appDir, "pdf", "merge", "page.js")], srcDir);
    expect(files).toContain(path.join(srcDir, "app", "pdf", "merge", "MergeClient.js"));
  });

  it("resolves imports transitively through components", () => {
    // pdf/page.js -> ToolCard -> theme.js
    const files = collectSourceFiles([path.join(appDir, "pdf", "page.js")], srcDir);
    expect(files).toContain(path.join(srcDir, "components", "ToolCard.js"));
    expect(files).toContain(path.join(srcDir, "lib", "theme.js"));
  });

  it("ignores bare third-party specifiers", () => {
    const entry = path.join(appDir, "vendor-test.js");
    fs.writeFileSync(entry, 'import React from "react";\nimport { PDFDocument } from "pdf-lib";');
    const files = collectSourceFiles([entry], srcDir);
    expect(files).toEqual([entry]);
    fs.rmSync(entry);
  });

  it("terminates on circular imports", () => {
    const a = path.join(appDir, "circ-a.js");
    const b = path.join(appDir, "circ-b.js");
    fs.writeFileSync(a, 'import "./circ-b";');
    fs.writeFileSync(b, 'import "./circ-a";');
    expect(collectSourceFiles([a], srcDir).sort()).toEqual([a, b].sort());
    fs.rmSync(a);
    fs.rmSync(b);
  });

  it("skips unreadable entry files without throwing", () => {
    const missing = path.join(appDir, "does-not-exist.js");
    expect(() => collectSourceFiles([missing], srcDir)).not.toThrow();
  });
});

describe("priorityFor", () => {
  it("ranks homepage above hubs above tool pages", () => {
    expect(priorityFor("/")).toBe(1);
    expect(priorityFor("/pdf")).toBe(0.8);
    expect(priorityFor("/pdf/merge")).toBe(0.6);
  });
});

describe("mtimeLastModified", () => {
  it("returns the newest mtime across the set", () => {
    const older = path.join(appDir, "page.js");
    const newer = path.join(appDir, "mtime-probe.js");
    fs.writeFileSync(newer, "export default 1;");
    const future = new Date(Date.now() + 60_000);
    fs.utimesSync(newer, future, future);

    const result = mtimeLastModified([older, newer]);
    expect(result.getTime()).toBeGreaterThan(fs.statSync(older).mtimeMs);
    fs.rmSync(newer);
  });

  it("returns null when no file is readable", () => {
    expect(mtimeLastModified([path.join(appDir, "nope.js")])).toBe(null);
  });
});

describe("buildSitemapEntries", () => {
  const baseUrl = "https://wary.tools";
  const build = () => buildSitemapEntries({ baseUrl, appDir, srcDir, cwd: tmpDir });

  // Next normalizes the homepage's `canonical: "/"` to a base URL with no
  // trailing slash, so the sitemap must emit the same bare form rather than
  // "https://wary.tools/" — otherwise the two disagree about the same page.
  it("emits the homepage without a trailing slash, matching the canonical URL", () => {
    const home = build().find((entry) => entry.priority === 1);
    expect(home.url).toBe("https://wary.tools");
  });

  // Replaces an earlier guard that asserted the opposite. It was added to make
  // <loc> match layout.js's canonical, on the assumption that the canonical
  // carried a trailing slash — but Next normalizes `canonical: "/"` down to the
  // bare origin, so requiring the slash produced the mismatch it meant to
  // prevent. The homepage is the one route allowed to be the bare origin;
  // every other entry must still carry a path.
  it("emits a bare origin only for the homepage", () => {
    for (const entry of build()) {
      if (entry.priority === 1) continue;
      expect(entry.url).not.toBe(baseUrl);
      expect(entry.url.startsWith(`${baseUrl}/`)).toBe(true);
    }
  });

  // discoverRoutes finds every page.js by design, which is what makes adding a
  // tool a zero-edit change — and is exactly why a page that exists only as
  // the end of a private journey has to be named to stay out. Without this,
  // adding any token-gated page silently advertises it to crawlers.
  it("omits the newsletter's token-gated pages", () => {
    const urls = build().map((entry) => entry.url);
    expect(urls).not.toContain("https://wary.tools/newsletter/confirm");
    expect(urls).not.toContain("https://wary.tools/newsletter/unsubscribe");
    expect(urls.some((url) => url.includes("/newsletter"))).toBe(false);
  });

  it("still discovers ordinary pages alongside the exclusions", () => {
    // Guards against the filter being written too broadly — an exclusion that
    // dropped real pages would be invisible here without this.
    const urls = build().map((entry) => entry.url);
    expect(urls).toContain("https://wary.tools/contact");
    expect(urls).toContain("https://wary.tools/pdf/merge");
  });

  it("builds absolute URLs for every discovered route", () => {
    const urls = build().map((entry) => entry.url);
    expect(urls).toContain("https://wary.tools/pdf");
    expect(urls).toContain("https://wary.tools/pdf/merge");
    expect(urls).not.toContain("https://wary.tools/api/shorten");
  });

  it("gives every entry a valid Date lastModified", () => {
    for (const entry of build()) {
      expect(entry.lastModified).toBeInstanceOf(Date);
      expect(Number.isNaN(entry.lastModified.getTime())).toBe(false);
    }
  });

  it("falls back to mtimes when the tree has no git history", () => {
    // The fixture tree lives in os.tmpdir(), outside any repo, so git yields
    // nothing for every file and the mtime path is what produces these dates.
    const entries = build();
    const home = entries.find((entry) => entry.url === "https://wary.tools");
    const pageMtime = fs.statSync(path.join(appDir, "page.js")).mtimeMs;
    expect(Math.abs(home.lastModified.getTime() - pageMtime)).toBeLessThan(5000);
  });

  it("falls back to the supplied clock when git and mtimes both yield nothing", () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "sitemap-empty-"));
    const emptyApp = path.join(emptyDir, "src", "app");
    fs.mkdirSync(path.join(emptyApp, "ghost"), { recursive: true });
    // A route directory whose page.js exists for discovery but is removed
    // before dating, leaving no readable file and no git history.
    fs.writeFileSync(path.join(emptyApp, "ghost", "page.js"), "export default function P() {}");

    const sentinel = new Date("2020-01-01T00:00:00Z");
    const entries = buildSitemapEntries({
      baseUrl,
      appDir: emptyApp,
      srcDir: path.join(emptyDir, "src"),
      cwd: emptyDir,
      now: () => sentinel,
    });

    // The homepage has no page.js at all -> no own files, no imports, no
    // mtimes -> the injected clock is the only remaining source.
    const home = entries.find((entry) => entry.url === "https://wary.tools");
    expect(home.lastModified).toEqual(sentinel);
    fs.rmSync(emptyDir, { recursive: true, force: true });
  });

  it("does not collapse routes onto one date when a shared module changes", () => {
    // Regression guard: dating pages by their transitive imports made a single
    // src/lib/tools.js edit flatten ~20 of 23 real URLs onto one timestamp,
    // which is exactly the signal that gets lastmod distrusted.
    //
    // This fixture has no git history, so it exercises the fallback path where
    // imports legitimately do count (they're the only signal left). The
    // guarantee asserted here is the weaker but still essential one: touching
    // a widely-imported module must not flatten the sitemap's date spread.
    // The primary git-backed path is covered by the routes-own-files test.
    const shared = path.join(srcDir, "lib", "tools.js");
    const future = new Date(Date.now() + 3_600_000);
    fs.utimesSync(shared, future, future);

    const entries = build();
    const stamped = entries.filter(
      (entry) => Math.abs(entry.lastModified.getTime() - future.getTime()) < 5000
    );

    expect(stamped.length).toBeLessThan(entries.length);
    expect(new Set(entries.map((entry) => entry.lastModified.getTime())).size).toBeGreaterThan(1);
  });

  it("dates a committed route from its own files, ignoring shared imports", () => {
    // The real repo (unlike the fixture) has git history, so this exercises
    // the primary path: a page's date comes from commits touching page.js and
    // its sibling client component, never from src/lib/tools.js.
    const repoRoot = process.cwd();
    const repoSrc = path.join(repoRoot, "src");
    const entries = buildSitemapEntries({
      baseUrl,
      appDir: path.join(repoSrc, "app"),
      srcDir: repoSrc,
      cwd: repoRoot,
    });

    // More than one distinct date proves pages aren't all inheriting the
    // newest shared-module commit.
    const distinct = new Set(entries.map((entry) => entry.lastModified.getTime()));
    expect(distinct.size).toBeGreaterThan(1);
  });

  it("marks the homepage weekly and other routes monthly", () => {
    const entries = build();
    const home = entries.find((entry) => entry.url === "https://wary.tools");
    const tool = entries.find((entry) => entry.url === "https://wary.tools/pdf/merge");
    expect(home.changeFrequency).toBe("weekly");
    expect(tool.changeFrequency).toBe("monthly");
  });
});
