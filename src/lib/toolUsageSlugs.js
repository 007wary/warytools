// The tool slugs the usage counter is allowed to record.
//
// This is a MIRROR of the `tool_usage_slugs` table in Postgres, which is the
// thing that actually enforces it: `increment_tool_usage` looks the slug up
// there and silently `return`s if it is absent. That silence is the problem
// this file exists to solve.
//
// A new tool ships, nobody remembers the DB step, and every use of it is
// discarded — no error, no log, no failed request, just a tool that can never
// appear in the trending section no matter how popular it gets. It happened to
// Word to PDF: the tool was live and converting for a day before anyone
// noticed its usage was going nowhere.
//
// Keeping the list in code doesn't enforce anything on its own (the browser
// can't grant itself a row). What it buys is a test — toolUsageSlugs.test.js
// asserts this list matches the registry exactly, so adding a tool to
// tools.js fails the suite until someone acknowledges the allowlist. The
// failure message says what SQL to run.
//
// Adding a tool therefore means three edits, in this order:
//   1. src/lib/tools.js         — the registry
//   2. this file                — the mirror
//   3. the database             — `insert into tool_usage_slugs ...`
//
// Why an allowlist at all, rather than recording whatever the client sends:
// `increment_tool_usage` is callable directly with the public anon key (see
// CLAUDE.md on the shortener — the same reasoning applies). Without it, anyone
// could insert arbitrary rows and either invent a trending tool or bloat the
// table with junk slugs.

import { allTools } from "./tools";

/**
 * Every slug that should be present in `tool_usage_slugs`.
 *
 * Derived from the registry rather than hand-listed: a hand-written copy is
 * one more place to forget, and the whole point here is to remove a step that
 * relies on memory. The test compares this against the registry independently,
 * so a typo in a registry href surfaces there.
 *
 * Slug form is the href with the leading slash stripped ("/pdf/merge" ->
 * "pdf/merge"), matching what `currentToolSlug()` in analytics.js produces at
 * runtime. The two representations must agree or nothing is ever recorded.
 */
export const TOOL_USAGE_SLUGS = allTools
  .map((tool) => tool.href.replace(/^\/+|\/+$/g, ""))
  .sort();

/**
 * The SQL to bring the table in line with the registry.
 *
 * Emitted by the test's failure message so the fix is copy-pasteable rather
 * than something to work out from scratch at the moment of failure.
 *
 * @param {string[]} missing Slugs present in the registry but not the table.
 * @returns {string}
 */
export function allowlistSql(missing) {
  if (!Array.isArray(missing) || missing.length === 0) return "";

  const values = missing.map((slug) => `  ('${slug}')`).join(",\n");
  return `insert into tool_usage_slugs (tool_slug)\nvalues\n${values}\non conflict (tool_slug) do nothing;`;
}
