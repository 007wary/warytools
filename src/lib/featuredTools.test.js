import { describe, expect, it } from "vitest";
import { allTools } from "./tools";
import {
  FEATURED_TOOL_HREFS,
  resolveFeaturedTools,
  resolveRemainingTools,
} from "./featuredTools";

describe("featuredTools", () => {
  it("every featured href resolves against the real registry", () => {
    // The whole point of the throw: this test is what turns a renamed tool
    // into a red build rather than a silently short hero grid.
    expect(() => resolveFeaturedTools(allTools)).not.toThrow();
  });

  it("throws, naming the href, when a featured tool leaves the registry", () => {
    const withoutMerge = allTools.filter((tool) => tool.href !== "/pdf/merge");
    expect(() => resolveFeaturedTools(withoutMerge)).toThrow(/\/pdf\/merge/);
  });

  it("preserves the declared order", () => {
    const featured = resolveFeaturedTools(allTools);
    expect(featured.map((tool) => tool.href)).toEqual(FEATURED_TOOL_HREFS);
  });

  it("has no duplicates", () => {
    expect(new Set(FEATURED_TOOL_HREFS).size).toBe(FEATURED_TOOL_HREFS.length);
  });

  it("featured and remaining partition the registry exactly", () => {
    // Asserts the property the homepage depends on: every tool appears in
    // exactly one of the two lists. A tool rendered twice looks like a bug to
    // a reader; a tool in neither is unreachable from the homepage entirely,
    // and neither would throw on its own.
    const featured = resolveFeaturedTools(allTools);
    const remaining = resolveRemainingTools(allTools);

    expect(featured.length + remaining.length).toBe(allTools.length);

    const combined = [...featured, ...remaining].map((tool) => tool.href).sort();
    expect(combined).toEqual(allTools.map((tool) => tool.href).sort());
  });

  it("spans more than one category, so the hero does not read as PDF-only", () => {
    const categories = new Set(resolveFeaturedTools(allTools).map((tool) => tool.category));
    expect(categories.size).toBeGreaterThan(1);
  });

  it("carries the fields a hero card renders", () => {
    for (const tool of resolveFeaturedTools(allTools)) {
      expect(tool.title).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.icon).toBeTruthy();
      expect(tool.category).toBeTruthy();
    }
  });
});
