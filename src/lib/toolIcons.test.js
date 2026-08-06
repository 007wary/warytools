import { describe, it, expect } from "vitest";
import * as lucide from "lucide-react";
import { allTools, categories } from "./tools";

// Guards the one failure mode ToolIcon is designed to survive, and therefore
// the one that hides: `iconMap[name] || FileText`.
//
// A tool naming an icon that isn't wired into the map renders FileText instead
// — the same glyph as the PDF category header. Nothing throws, nothing logs,
// and the card looks plausible, so it survives review. It already happened to
// PDF to Word and Word to PDF, which shipped sharing the category's icon.
//
// The map itself lives in a .js component file that imports JSX, so rather than
// import it here this checks the invariant that actually matters: every icon
// name in the registry is a real lucide export. A name that passes this and is
// still missing from ToolIcon's map is a one-line omission in a file this test
// points straight at.

describe("tool registry icons", () => {
  it("names an icon that exists in lucide-react", () => {
    const missing = allTools
      .map((tool) => tool.icon)
      .filter((name) => name && typeof lucide[name] !== "function" && typeof lucide[name] !== "object");

    expect(
      missing,
      missing.length === 0
        ? ""
        : `These icon names in tools.js don't exist in lucide-react, so ToolIcon ` +
            `will silently fall back to FileText: ${missing.join(", ")}`
    ).toEqual([]);
  });

  it("names an icon for every tool and every category", () => {
    for (const tool of allTools) {
      expect(tool.icon, `${tool.href} has no icon`).toBeTruthy();
    }
    for (const category of categories) {
      expect(category.icon, `${category.slug} has no icon`).toBeTruthy();
    }
  });

  it("gives each tool a unique href", () => {
    // A duplicate href would make two registry entries fight over one route,
    // and the usage slug derived from it would record both as the same tool.
    const hrefs = allTools.map((tool) => tool.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("gives each tool a description in the documented length range", () => {
    // tools.js asks for ~70-95 chars: long enough to carry intent keywords,
    // short enough to stay scannable at the 13.5px card size. This is the bulk
    // of the homepage's crawlable prose, so drift here is an SEO regression.
    for (const tool of allTools) {
      expect(tool.description.length, `${tool.href}: "${tool.description}"`).toBeGreaterThan(55);
      expect(tool.description.length, `${tool.href}: "${tool.description}"`).toBeLessThan(100);
    }
  });
});
