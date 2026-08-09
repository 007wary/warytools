// Single source of truth for the AdSense publisher ID.
//
// Three places need it and each fails differently when they disagree:
// the <script> tag (no ads), ads.txt (an "earnings at risk" warning in the
// AdSense dashboard and, left long enough, unfilled inventory), and the
// verification meta tag (a review that never completes). Inlining the literal
// in all three is how one of them ends up a character off with nothing to
// catch it.
//
// It is NOT read from the environment, unlike NEXT_PUBLIC_GA_ID. A publisher
// ID is public by construction — it ships in the page source of every site
// running AdSense and is served at /ads.txt on purpose — so there is nothing
// to protect, and an unset env var on a fresh deploy would silently take the
// site's ads offline. Hardcoding it means the value is versioned, reviewable,
// and cannot go missing.
export const ADSENSE_PUBLISHER_ID = "pub-5519794416240476";

// The `client` parameter and the meta tag both want the "ca-" prefix; ads.txt
// wants the bare ID. Keeping both derivations here rather than at the call
// sites is the whole point of the module — see the ads.txt route, where the
// bare form is what Google's crawler matches against.
export const ADSENSE_CLIENT_ID = `ca-${ADSENSE_PUBLISHER_ID}`;

// Ads are disabled outside production for two independent reasons, either of
// which is sufficient. Clicking your own ads on a preview deploy is invalid
// traffic and is the most common way a new publisher gets banned. And a
// *.vercel.app preview is not a site Google has approved, so serving the tag
// there means requesting ads for an unauthorised host — which is what
// generates the "ad serving has been limited" mails.
//
// Matches robots.js's isNonCanonicalDeploy() and the CSP report-uri gate in
// next.config.mjs: VERCEL_ENV is unset for local builds and non-Vercel hosts.
// Those are treated as production-like, so a self-hosted `next build` still
// renders the tag — the same convention the rest of the codebase uses.
//
// Reads the *bare* VERCEL_ENV, not a NEXT_PUBLIC_ copy, which is only safe
// because every caller is a server component. Vercel exposes the bare form to
// the build and the server but not to the browser bundle, so calling this from
// a "use client" component would read undefined, fall into the `!vercelEnv`
// branch, and serve live ad tags on every preview deploy — the exact invalid
// traffic this guard exists to prevent. Keep it server-side.
export function adsEnabled(vercelEnv = process.env.VERCEL_ENV) {
  return !vercelEnv || vercelEnv === "production";
}
