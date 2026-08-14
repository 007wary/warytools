// The six tools promoted to hero cards on the homepage.
//
// Why six, and why hand-picked rather than derived from usage:
//
// The homepage grid gives all 33 tools identical visual weight, which reads as
// a directory rather than a product. But demand is nothing like uniform — the
// merge/compress/convert jobs are the overwhelming majority of what anyone
// arrives wanting, and burying them among 33 equal cards means the page never
// answers "what is this site for" in the second someone spends deciding.
//
// This is deliberately NOT `rankTools()`. That module ranks by *observed*
// usage and correctly falls back to curated order until it has enough data
// (MIN_TOTAL_USES). Feeding the hero from it would make the site's primary
// layout swing on a handful of clicks, and — worse — it would be circular:
// the hero is the biggest driver of clicks, so it would mostly rank whatever
// it promoted last hour. The trending chip row still exists to surface real
// usage; that is the honest place for it. The hero is an editorial decision.
//
// Chosen for breadth of intent, not just PDF volume: four PDF entry points
// covering the four distinct jobs people search for (combine, shrink, split,
// convert-to-editable), plus the two highest-intent non-PDF tools so the page
// does not read as PDF-only. Every one of these is a phrase people actually
// type into a search box.
//
// Order is deliberate: it is the reading order of the grid, so the most-wanted
// tool sits top-left where the eye lands first.
export const FEATURED_TOOL_HREFS = [
  "/pdf/merge",
  "/pdf/compress",
  "/image/compress",
  "/pdf/split",
  "/pdf/to-word",
  "/image/resize",
];

/**
 * Resolves the featured hrefs against the registry.
 *
 * Throws on a miss rather than filtering it out, for the same reason
 * <ToolCallout> throws on an unknown slug: a silently-dropped hero card is a
 * five-card grid that still looks deliberate, so nothing would ever reveal
 * that a tool had been renamed. A build failure names the problem instead.
 *
 * @param {Array<{href: string}>} allTools The flat registry list.
 * @returns {Array<object>} The featured tools, in FEATURED_TOOL_HREFS order.
 */
export function resolveFeaturedTools(allTools) {
  return FEATURED_TOOL_HREFS.map((href) => {
    const tool = allTools.find((candidate) => candidate.href === href);
    if (!tool) {
      throw new Error(
        `featuredTools: no tool in the registry has href "${href}". ` +
          `Update FEATURED_TOOL_HREFS in src/lib/featuredTools.js when a tool moves or is removed.`
      );
    }
    return tool;
  });
}

/**
 * The tools NOT featured, for the collapsed "all tools" listing.
 *
 * Kept as its own function so the two lists are derived from one source and
 * cannot drift into showing a tool twice or dropping one entirely — the
 * homepage asserts nothing about the split, it just renders both halves.
 */
export function resolveRemainingTools(allTools) {
  const featured = new Set(FEATURED_TOOL_HREFS);
  return allTools.filter((tool) => !featured.has(tool.href));
}
