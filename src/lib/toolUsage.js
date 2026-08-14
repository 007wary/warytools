// Data layer for the trending-tools section.
//
// Write path runs in the browser (fire-and-forget, alongside the existing GA
// event); read path runs on the server during ISR. The ranking itself lives
// in toolRanking.js — this module only moves rows.

// NOT a static import. `@supabase/supabase-js` pulls in auth (GoTrue),
// realtime (websockets), storage, and postgrest — ~200 KB of JS — and this
// module is reached from lib/analytics.js, which every tool client and the
// root layout's AnalyticsRouteTracker import. A static import therefore put
// the entire Supabase SDK in the initial bundle of *every page on the site*
// to support one fire-and-forget RPC that only ever runs after a user
// interaction. That alone cost ~25 points of Lighthouse mobile performance.
//
// The server read path (fetchToolUsage) imports it the same way: there it
// costs nothing, and keeping one accessor means the two paths can't drift.
async function getSupabase() {
  const { supabase } = await import("./supabaseClient");
  return supabase;
}

// Window the ranking looks at. Matches the "trending this week" framing.
export const USAGE_WINDOW_DAYS = 7;

// One tool_run per tool per session is enough to establish "this got used".
// Without this a calculator that fires on a debounce, or one person testing
// the same tool repeatedly, would skew the ranking. sessionStorage (not
// localStorage) so a genuine return visit tomorrow counts again.
const SESSION_KEY_PREFIX = "wt_usage_";

function alreadyCountedThisSession(kind, slug) {
  try {
    const key = `${SESSION_KEY_PREFIX}${kind}_${slug}`;
    if (window.sessionStorage.getItem(key)) return true;
    window.sessionStorage.setItem(key, "1");
    return false;
  } catch {
    // Private mode / storage disabled: count it rather than lose the signal.
    return false;
  }
}

/**
 * Records one use of a tool. Safe to call unconditionally from anywhere in a
 * client component: it no-ops during SSR, when Supabase is unconfigured, and
 * on any network failure. Usage tracking must never break a tool or block
 * its UI, so nothing here is awaited by callers.
 */
export function recordToolUsage(slug, kind = "run") {
  if (typeof window === "undefined") return;
  if (!slug || slug === "home" || slug === "unknown") return;
  if (kind !== "run" && kind !== "search") return;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return;
  // Runs and search clicks dedupe independently: searching for a tool and
  // then actually running it are two distinct signals from one session, and
  // collapsing them would silently drop whichever happened second.
  if (alreadyCountedThisSession(kind, slug)) return;

  // Deliberately not awaited — this is telemetry, not part of the tool's
  // work. The chained catch covers both the dynamic import and the RPC, so
  // neither a failed chunk fetch nor a failed request surfaces as an
  // unhandled rejection.
  getSupabase()
    .then((supabase) =>
      supabase.rpc("increment_tool_usage", { p_tool_slug: slug, p_kind: kind })
    )
    .then(() => {})
    .catch(() => {});
}

/**
 * Records that a user picked this tool out of search results.
 *
 * Currently UNCALLED: the homepage search box this served was removed in
 * favour of a server-rendered directory (see components/ToolDirectory.js).
 * Kept because it is the write half of the SEARCH_WEIGHT signal in
 * toolRanking.js, which stays live for historical rows and is what a real
 * search route would call. Delete both halves together, or neither.
 *
 * `href` is the registry path ("/pdf/merge"); the counter keys on the slug
 * form ("pdf/merge") that currentToolSlug() produces, so normalise here.
 */
export function recordSearchClick(href) {
  if (typeof href !== "string") return;
  recordToolUsage(href.replace(/^\/+|\/+$/g, ""), "search");
}

/**
 * Reads aggregated usage for the ranking window. Server-side only — called
 * from the homepage during ISR, never from a client component.
 *
 * Returns [] on any failure so the homepage degrades to its curated fallback
 * rather than erroring: a broken analytics table must not take down the page.
 */
export async function fetchToolUsage(days = USAGE_WINDOW_DAYS) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return [];
  }

  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase.rpc("get_tool_usage", { p_days: days });
    if (error || !Array.isArray(data)) return [];
    return data;
  } catch {
    return [];
  }
}

/**
 * Usage rows plus the timestamp they were read at.
 *
 * The read time is captured here, inside the async data layer, rather than in
 * the page component: calling Date.now() in a component body is impure (React
 * may re-render at any time, and the lint rule that flags it is correct to).
 * Sampling it alongside the fetch is both pure from the component's view and
 * more accurate — it is the moment the data is actually from.
 */
export async function fetchToolUsageSnapshot(days = USAGE_WINDOW_DAYS) {
  const usage = await fetchToolUsage(days);
  return { usage, fetchedAt: Date.now() };
}
