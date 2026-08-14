// Ranking algorithm for the homepage "Trending tools" section.
//
// Pure functions only — no Supabase, no React, no Date.now() reads that
// aren't injectable. Per CLAUDE.md, logic that decides what a user sees
// belongs in src/lib/ so it can actually be tested; the data fetching lives
// in toolUsage.js and the rendering in components/TrendingTools.js.

// Weight of a search->click relative to a completed tool run.
//
// The two signals are not equivalent. A run means the user finished a job; a
// search click means they wanted the tool enough to navigate to it, but may
// have bounced immediately. Weighting clicks below runs keeps the ranking
// anchored to tools people actually complete work with, while still letting
// search demand surface a tool that is hard to find in the grid.
//
// DORMANT as of the homepage restructure. The homepage search box was
// removed (see components/ToolDirectory.js), and it was the only caller of
// recordSearchClick — so no new row carries a non-zero `searches`, and this
// weight currently contributes nothing to any live score.
//
// Kept rather than deleted, and the arithmetic kept with it, for two
// reasons: historical rows in tool_usage_hourly still hold real search
// counts and must keep ranking correctly while they remain in the window,
// and the signal is the natural one to restore if a real search route is
// ever added. weightedInterest() already treats a missing/zero `searches` as
// zero, so the dormant path needs no special case.
//
// Note the write path only ever recorded a click, never a bare query match:
// the old filter ran on every keystroke with no submit event, so "queries
// that matched this tool" would have ranked tools by how common their
// leading letters are ("c" matched four).
export const SEARCH_WEIGHT = 0.4;

// A tool needs this much weighted interest in the window before it can be
// ranked at all. Below it, one person clicking twice would outrank a
// genuinely popular tool, and the "trending" label would be a lie. See
// MIN_TOTAL_USES for the whole-section gate.
export const MIN_TOOL_USES = 5;

// The section as a whole stays in curated-fallback mode until the window
// carries at least this much traffic. Prevents shipping a ranking built on
// a handful of visits during the site's first weeks.
export const MIN_TOTAL_USES = 40;

// How many tools the section shows.
export const TRENDING_COUNT = 4;

// Gravity for the time-decay denominator. 1.5 is the Hacker News value and
// behaves well here: a tool used heavily two days ago still places, but a
// burst from six days ago has mostly washed out. Lower = counts dominate and
// the list calcifies; higher = the list churns on noise.
const GRAVITY = 1.5;

// Added to the age so a just-used tool doesn't divide by ~0 and score
// absurdly high off a single use.
const AGE_OFFSET_HOURS = 2;

/**
 * Combines the two raw signals into one "interest" figure.
 *
 * Kept separate from trendingScore so the gate checks (MIN_TOOL_USES) and the
 * ranking agree on what a tool's interest is — an earlier version gated on
 * runs alone, which quietly excluded search-heavy tools from the ranking
 * they were supposed to be surfaced by.
 */
export function weightedInterest({ uses, searches }) {
  const runs = Number.isFinite(uses) && uses > 0 ? uses : 0;
  const clicks = Number.isFinite(searches) && searches > 0 ? searches : 0;
  return runs + SEARCH_WEIGHT * clicks;
}

/**
 * Decayed popularity score.
 *
 * score = (runs + 0.4 * search_clicks) / (hours_since_last_use + 2) ^ 1.5
 *
 * Raw counts were the obvious alternative and are wrong for "trending":
 * whatever leads first keeps leading forever, because the lead is cumulative
 * and nothing ever subtracts. Dividing by an age term means a tool has to
 * keep earning its place.
 */
export function trendingScore({ uses, searches, lastUsedAt, now }) {
  const interest = weightedInterest({ uses, searches });
  if (interest <= 0) return 0;

  const lastUsed = toTime(lastUsedAt);
  const nowMs = toTime(now);
  if (lastUsed === null || nowMs === null) return 0;

  // Clock skew between the DB and the renderer can put lastUsed slightly in
  // the future; clamping at 0 keeps the age term sane.
  const ageHours = Math.max(0, (nowMs - lastUsed) / 3_600_000);

  return interest / Math.pow(ageHours + AGE_OFFSET_HOURS, GRAVITY);
}

function toTime(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.getTime();
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

/**
 * Turns raw usage rows into the list the homepage renders.
 *
 * Returns { mode, tools }:
 *   mode "curated"  — not enough data yet; `tools` is the caller's fallback
 *                     order and the UI must NOT claim these are trending.
 *   mode "trending" — `tools` is genuinely ranked by recent usage.
 *
 * `usage` rows are { tool_slug, uses, last_used }; `tools` is the registry
 * list (allTools). Anything in `usage` with no matching registry entry is
 * dropped — a slug can outlive the tool it names.
 */
export function rankTools({ usage = [], tools = [], now = Date.now(), limit = TRENDING_COUNT } = {}) {
  const fallback = { mode: "curated", tools: tools.slice(0, limit) };

  if (!Array.isArray(usage) || usage.length === 0) return fallback;

  const bySlug = new Map(tools.map((tool) => [slugFor(tool), tool]));

  let totalUses = 0;
  const scored = [];

  for (const row of usage) {
    const uses = Number(row?.uses);
    const searches = Number(row?.searches);
    const interest = weightedInterest({ uses, searches });
    if (interest <= 0) continue;

    // Count every real signal toward the section-wide gate, including tools
    // individually below MIN_TOOL_USES — the gate is asking "does this site
    // have traffic yet", not "is this tool popular".
    totalUses += interest;

    const tool = bySlug.get(row?.tool_slug);
    if (!tool) continue;
    if (interest < MIN_TOOL_USES) continue;

    scored.push({
      tool,
      interest,
      score: trendingScore({ uses, searches, lastUsedAt: row?.last_used, now }),
    });
  }

  if (totalUses < MIN_TOTAL_USES) return fallback;
  if (scored.length < limit) return fallback;

  scored.sort((a, b) => b.score - a.score || b.interest - a.interest || compareSlug(a, b));

  return {
    mode: "trending",
    tools: scored.slice(0, limit).map((entry) => entry.tool),
  };
}

// Registry hrefs are "/pdf/merge"; usage slugs are "pdf/merge" (currentToolSlug
// strips the leading slash). Normalising here keeps the two representations
// from having to agree anywhere else.
export function slugFor(tool) {
  return typeof tool?.href === "string" ? tool.href.replace(/^\/+|\/+$/g, "") : "";
}

// Deterministic last-resort tiebreak so equal scores don't reorder between
// renders — a list that shuffles on refresh looks broken.
function compareSlug(a, b) {
  return slugFor(a.tool).localeCompare(slugFor(b.tool));
}
