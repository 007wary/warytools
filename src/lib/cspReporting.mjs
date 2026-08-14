// Decides whether a build emits the CSP `report-uri` directive, and builds it
// from the Sentry DSN.
//
// The .mjs extension is deliberate and load-bearing. next.config.mjs is
// evaluated by Node directly, outside the bundler, and this package has no
// "type": "module" — so a plain .js file here makes Node reparse it as ESM and
// emit a MODULE_TYPELESS_PACKAGE_JSON warning on every build. Naming it .mjs
// states the module type locally instead of setting "type": "module"
// repo-wide, which would change how every other .js file in the project is
// interpreted. Importers must spell the extension out (see the test).
//
// This lives in src/lib/ rather than inline in next.config.mjs for the reason
// the project's testing notes give for pdfPageRange.js: logic that guards
// something a person can get wrong belongs somewhere it can be tested. This
// particular decision shipped wrong twice, and neither version had a test —
// next.config.mjs reads process.env at module scope, so importing it in a test
// captures whatever the environment was at import time and can never exercise
// the branches. Pulling the decision out as a pure function of an env object is
// what makes the preview case assertable at all.

/**
 * Whether this build should emit `report-uri`.
 *
 * Requires a positive `VERCEL_ENV === "production"`. Notably it does NOT try to
 * infer "are we on Vercel" from VERCEL_URL/VERCEL — that inference is what
 * failed the second time. On a preview whose build step exposes none of those
 * variables, an inferring gate is indistinguishable from a self-hosted build
 * and falls through to reporting, which is exactly what happened.
 *
 * The asymmetry is deliberate. A missing report costs one violation on a host
 * we control and can re-check by hand. A wrongly-emitted one costs a permanent
 * stream of reports that are unfixable by construction — they name same-origin
 * paths that `'self'` already allows, because Vercel's deployment protection
 * redirects them cross-origin — and that stream buries the reports from
 * wary.tools that the endpoint exists to surface.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {boolean}
 */
export function cspReportingEnabled(env = process.env) {
  // Opt-in escape hatch for a genuine self-hosted deploy. It has to be opt-in:
  // a self-hosted build cannot be told apart from a Vercel preview by any
  // variable available here, and only one of those two should report.
  if (env.CSP_REPORT_URI_ENABLED === "1") return true;
  return env.VERCEL_ENV === "production";
}

/**
 * Builds Sentry's security-header endpoint from the DSN.
 *
 * Derived rather than hardcoded so it stays correct if the DSN rotates, and
 * returns null for a malformed or absent DSN so the directive disappears
 * cleanly instead of emitting a broken URL that silently drops every report.
 *
 * @param {string | undefined} dsn
 * @returns {string | null}
 */
export function sentryCspReportUri(dsn) {
  if (!dsn) return null;
  try {
    const { username: publicKey, hostname, pathname } = new URL(dsn);
    const projectId = pathname.replace(/^\//, "");
    if (!publicKey || !projectId) return null;
    return `https://${hostname}/api/${projectId}/security/?sentry_key=${publicKey}`;
  } catch {
    return null;
  }
}

/**
 * Whether the CSP should name the AdSense hosts.
 *
 * Mirrors `adsEnabled()` in lib/adsense.js exactly. Kept as a separate function
 * with a pointer rather than importing it, because next.config.mjs cannot
 * import from the "@/" alias — but the two must agree, and a test asserts they
 * do across every environment shape.
 *
 * A policy that closes the ad hosts while adsense.js still renders the tag is
 * the blank-inventory failure that CSP block documents at length: slots present
 * in the DOM, permanently empty, reported by AdSense as zero impressions.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {boolean}
 */
export function adsAllowedInCsp(env = process.env) {
  return !env.VERCEL_ENV || env.VERCEL_ENV === "production";
}
