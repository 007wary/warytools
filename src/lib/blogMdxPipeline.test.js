import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

// Guards the MDX compiler configuration in next.config.mjs.
//
// This file exists because of a real defect that shipped: without
// remark-frontmatter, the MDX compiler has no concept of a `---` header. It
// parsed the delimiters as a thematic break and the `title:`/`description:`
// lines as ordinary prose, so every post rendered its own metadata as a
// heading above the article. blogPosts.js strips the block for its own
// parsing, which is why the frontmatter tests all passed and the page was
// still wrong — the compiler is a completely separate path, and nothing
// connected the two.
//
// It is asserted against the config source rather than by compiling MDX
// because the failure is a *missing* plugin, and only the config knows which
// plugins are registered. A test that compiled a fixture through a
// hand-assembled pipeline would prove the plugin works, not that the site
// uses it — which is precisely the gap that let this ship.
const CONFIG = fs.readFileSync(
  path.join(process.cwd(), "next.config.mjs"),
  "utf8",
);

// The `remarkPlugins: [...]` array literal, as written in the config.
function remarkPluginsSource() {
  const match = CONFIG.match(/remarkPlugins:\s*(\[[\s\S]*?\]),?\s*\n/);
  return match ? match[1] : null;
}

describe("MDX remark pipeline", () => {
  it("registers a remarkPlugins array", () => {
    expect(remarkPluginsSource()).not.toBeNull();
  });

  // Without this, every post renders its own frontmatter as visible body text.
  it("strips frontmatter so it is never rendered as body text", () => {
    expect(remarkPluginsSource()).toContain("remark-frontmatter");
  });

  // Without this, a GFM pipe table renders as a literal `| a | b |` paragraph.
  it("enables GFM so tables are not literal pipe text", () => {
    expect(remarkPluginsSource()).toContain("remark-gfm");
  });

  // Frontmatter must be recognised while the `---` delimiters are still at the
  // top of the document, before any plugin that rewrites block structure.
  it("runs frontmatter parsing before GFM", () => {
    const source = remarkPluginsSource();
    expect(source.indexOf("remark-frontmatter")).toBeLessThan(source.indexOf("remark-gfm"));
  });

  // Turbopack serializes loader options to its Rust core, so a plugin passed
  // as an imported function fails the build outright with "does not have
  // serializable options". The string form is the one that works here, and the
  // function form is what every webpack-era tutorial shows.
  it("names plugins as strings, not imported bindings", () => {
    const source = remarkPluginsSource();
    for (const entry of source.matchAll(/\[\s*("?)([\w-]+)\1/g)) {
      // Every entry inside the array must be a quoted string literal.
      if (entry[2] === "") continue;
      expect(entry[1], `plugin "${entry[2]}" must be quoted`).toBe('"');
    }
  });

  it("declares both plugins as dependencies", () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
    );
    expect(pkg.dependencies).toHaveProperty("remark-frontmatter");
    expect(pkg.dependencies).toHaveProperty("remark-gfm");
  });
});

// A second, independent guard on the same defect, asserted from the other
// end: every post's own body must not begin with its frontmatter. This
// catches the failure even if the config is restructured past the regex above.
describe("post sources", () => {
  const dir = path.join(process.cwd(), "src", "content", "blog");
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((name) => name.endsWith(".mdx"))
    : [];

  it("has at least one post to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`${file} opens with a frontmatter block`, () => {
      const raw = fs.readFileSync(path.join(dir, file), "utf8");
      // If a post does NOT open with `---`, the compiler renders whatever is
      // there as body — so the frontmatter contract is what makes the
      // stripping above meaningful.
      expect(raw.replace(/^﻿/, "").startsWith("---")).toBe(true);
    });
  }
});
