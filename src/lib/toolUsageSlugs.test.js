import { describe, it, expect } from "vitest";
import { TOOL_USAGE_SLUGS, allowlistSql } from "./toolUsageSlugs";
import { allTools } from "./tools";

// Snapshot of the `tool_usage_slugs` table, verified against the live database
// on 2026-08-06 (and again when PowerPoint to PDF was added, and again when
// Crop PDF, PDF to JPG, and JPG to PDF were added — each time by selecting the
// table back after the insert rather than assuming it landed). Hand-maintained
// on purpose: this is the only representation of the DB state that lives in the
// repo, so it is what makes a missing allowlist row visible without a network
// call.
//
// When this test fails because a tool was added, the fix is TWO steps — add the
// slug below AND run the emitted SQL. Editing only this list makes the test
// pass while the tool's usage is still being silently discarded, which is
// exactly the failure being guarded against. Do not "fix" it by editing this
// list alone.
const ALLOWLISTED_IN_DATABASE = [
  "calculators/age",
  "calculators/date-difference",
  "calculators/emi",
  "calculators/gst",
  "calculators/interest",
  "calculators/percentage",
  "calculators/unit-converter",
  "image/compress",
  "image/convert",
  "image/resize",
  "image/to-pdf",
  "pdf/compress",
  "pdf/crop",
  "pdf/merge",
  "pdf/powerpoint-to-pdf",
  "pdf/reorder",
  "pdf/rotate",
  "pdf/split",
  "pdf/to-jpg",
  "pdf/to-word",
  "pdf/word-to-pdf",
  "url-shortener",
].sort();

describe("tool usage allowlist", () => {
  // The guard that matters. `increment_tool_usage` silently returns for an
  // unknown slug, so a tool missing from the table records nothing at all and
  // can never trend — with no error anywhere to notice. Word to PDF shipped
  // that way and was live for a day before it was caught.
  it("has a database row for every tool in the registry", () => {
    const missing = TOOL_USAGE_SLUGS.filter(
      (slug) => !ALLOWLISTED_IN_DATABASE.includes(slug)
    );

    expect(
      missing,
      missing.length === 0
        ? ""
        : `These tools are in the registry but not in tool_usage_slugs, so their ` +
            `usage is being silently discarded and they can never appear in the ` +
            `trending section. Run this against the database, then add them to ` +
            `ALLOWLISTED_IN_DATABASE in this file:\n\n${allowlistSql(missing)}\n`
    ).toEqual([]);
  });

  // The other direction is a much milder problem — a stale row records usage
  // for a tool that no longer exists, and rankTools drops unknown slugs when it
  // joins against the registry. Worth surfacing so the table doesn't accumulate
  // orphans, but it is cleanup rather than a bug.
  it("has no allowlisted slugs that no longer name a tool", () => {
    const orphaned = ALLOWLISTED_IN_DATABASE.filter(
      (slug) => !TOOL_USAGE_SLUGS.includes(slug)
    );

    expect(
      orphaned,
      orphaned.length === 0
        ? ""
        : `These slugs are allowlisted but match no tool in the registry — ` +
            `either a tool was renamed (add the new slug too) or removed ` +
            `(delete these rows): ${orphaned.join(", ")}`
    ).toEqual([]);
  });

  it("derives slugs in the form currentToolSlug() produces at runtime", () => {
    // analytics.js strips leading and trailing slashes off location.pathname.
    // If these disagree, the RPC is called with a slug the table cannot match
    // and every recording is dropped.
    for (const slug of TOOL_USAGE_SLUGS) {
      expect(slug.startsWith("/"), slug).toBe(false);
      expect(slug.endsWith("/"), slug).toBe(false);
    }
  });

  it("covers every registry tool exactly once", () => {
    expect(TOOL_USAGE_SLUGS).toHaveLength(allTools.length);
    expect(new Set(TOOL_USAGE_SLUGS).size).toBe(allTools.length);
  });

  it("includes every server-side converter", () => {
    // Named explicitly because these are the newest tools and the ones whose
    // absence prompted this test. They are also the three that upload, so the
    // list doubles as the check that the privacy copy's "three tools" claim
    // still matches the registry.
    expect(TOOL_USAGE_SLUGS).toContain("pdf/to-word");
    expect(TOOL_USAGE_SLUGS).toContain("pdf/word-to-pdf");
    expect(TOOL_USAGE_SLUGS).toContain("pdf/powerpoint-to-pdf");
  });
});

describe("allowlistSql", () => {
  it("emits runnable, idempotent SQL for the missing slugs", () => {
    const sql = allowlistSql(["pdf/word-to-pdf", "image/crop"]);
    expect(sql).toContain("insert into tool_usage_slugs");
    expect(sql).toContain("('pdf/word-to-pdf')");
    expect(sql).toContain("('image/crop')");
    // Idempotent so re-running it after a partial fix is safe.
    expect(sql).toContain("on conflict (tool_slug) do nothing");
  });

  it("returns nothing when there is nothing to add", () => {
    expect(allowlistSql([])).toBe("");
    expect(allowlistSql(null)).toBe("");
  });
});
