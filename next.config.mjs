import createMdx from "@next/mdx";
import { withSentryConfig } from "@sentry/nextjs";

// Sentry can ingest CSP violation reports on the same DSN used for error
// tracking (its "security header endpoint"), so violations show up
// alongside JS errors with no separate reporting infra. Derived from the
// DSN's own host/key/project-id rather than hardcoded, so it stays correct
// if the DSN rotates and disappears cleanly (report-uri omitted) if unset.
function sentryCspReportUri() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return null;

  // Preview deploys are excluded, and not as a matter of taste: Vercel's
  // deployment protection 302s every request on a *.vercel.app preview to
  // vercel.com/sso-api. That redirect is cross-origin, so the browser blocks
  // it and reports the violation against the *original* same-origin URI —
  // `/pdf/watermark?_rsc=…`, `/_next/static/chunks/….js`. The reports are
  // therefore unfixable by construction: they name paths that `'self'`
  // already allows, and no change to this policy can silence them. One
  // headless crawler hitting a protected preview filed 49 events in a single
  // session that way, burying real violations from wary.tools.
  //
  // This can't be filtered in `sentry.client.config.js`: `report-uri` is a
  // POST the *browser* makes directly to Sentry, so the SDK is not in the
  // path and `beforeSend` never runs on a CSP report. Not emitting the
  // directive off production is the only place the noise can be stopped.
  //
  // Matches robots.js's isNonCanonicalDeploy(): VERCEL_ENV is unset for local
  // builds and non-Vercel hosts, which stay canonical so a self-hosted
  // `next build` still reports violations.
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv && vercelEnv !== "production") return null;

  try {
    const { username: publicKey, hostname, pathname } = new URL(dsn);
    const projectId = pathname.replace(/^\//, "");
    return `https://${hostname}/api/${projectId}/security/?sentry_key=${publicKey}`;
  } catch {
    return null;
  }
}

// Security headers applied to every response. Since all PDF/image processing
// happens client-side with no first-party API, the CSP can stay tight —
// scripts/styles need 'self' (+ 'unsafe-inline' for Next's inline
// bootstrap/style tags) and connect-src only needs to reach Supabase and
// Sentry (error reporting from the browser), plus the Google Analytics
// hosts added below when a measurement ID is configured.
const reportUri = sentryCspReportUri();

// React's dev-mode overlay uses eval() to reconstruct stack traces across
// module boundaries; it never does this in production builds, so
// 'unsafe-eval' is added only when running `next dev`.
const isDev = process.env.NODE_ENV === "development";

// Google Analytics needs three CSP holes, so they're opened only when a
// measurement ID is configured — with analytics off the policy stays as
// tight as it was before. gtag.js is served from googletagmanager.com, sends
// hits to the google-analytics.com/google.com collect endpoints, and falls
// back to a GIF pixel on those same hosts when sendBeacon/fetch is
// unavailable (hence the img-src entries).
//
// Three of these hosts are easy to get wrong and each fails as a blocked
// hit rather than an error, so the page_view simply never arrives:
//   - `analytics.google.com` is sent to *bare*, and a `*.` wildcard matches
//     subdomains only, never the apex — so it needs its own entry alongside
//     `*.analytics.google.com`.
//   - `www.google.com/g/collect` is the Google-signals ping, fired whenever
//     signals/ads features are on for the property. It is not a
//     google-analytics.com host at all.
//   - that ping follows the visitor's region, so it goes to google.co.in,
//     google.de, and so on. There is no wildcard shape for a TLD, so the
//     common mirrors are listed explicitly; an unlisted one costs only the
//     signals ping, never the page_view above.
//   - `stats.g.doubleclick.net` gets the same signals ping and is on yet
//     another domain. Found via the Sentry CSP reports, not the console —
//     it only fires for a subset of visitors, so a single local session
//     never shows it.
//
// The CSP report-uri above is what makes this list maintainable: a host we
// miss arrives as a Sentry issue tagged `blocked-host` rather than as
// silently absent analytics. Check there before adding guesses here.
const gaSignalsHosts = ["https://stats.g.doubleclick.net"];

const gaRegionalSignalsHosts = [
  "https://www.google.com",
  "https://www.google.co.in",
  "https://www.google.co.uk",
  "https://www.google.ca",
  "https://www.google.com.au",
  "https://www.google.de",
  "https://www.google.fr",
  "https://www.google.es",
  "https://www.google.it",
  "https://www.google.nl",
  "https://www.google.com.br",
  "https://www.google.co.jp",
  "https://www.google.com.sg",
  // Added from real Sentry `blocked-host` reports rather than guessed:
  // google.com.sa arrived from a Dammam visitor on 2026-08-08. The rest are
  // the mirrors for the next-largest slices of this site's traffic, which
  // the same ping would otherwise keep reporting one country at a time.
  "https://www.google.com.sa",
  "https://www.google.ae",
  "https://www.google.com.pk",
  "https://www.google.com.bd",
  "https://www.google.com.ph",
  "https://www.google.com.my",
  "https://www.google.co.id",
  "https://www.google.com.vn",
  "https://www.google.com.tr",
  "https://www.google.com.mx",
  "https://www.google.com.ar",
  "https://www.google.co.za",
  "https://www.google.com.ng",
  "https://www.google.com.eg",
  "https://www.google.pl",
  "https://www.google.se",
  "https://www.google.ch",
  "https://www.google.be",
  "https://www.google.at",
  "https://www.google.ie",
  "https://www.google.pt",
  "https://www.google.gr",
  "https://www.google.co.kr",
  "https://www.google.com.tw",
  "https://www.google.com.hk",
  "https://www.google.co.nz",
];

const gaCollectHosts = [
  "https://www.google-analytics.com",
  "https://*.google-analytics.com",
  "https://analytics.google.com",
  "https://*.analytics.google.com",
  ...gaSignalsHosts,
  ...gaRegionalSignalsHosts,
].join(" ");

// Google AdSense needs holes in five directives, and unlike the GA list above
// these are not optional-if-you-want-analytics — a missed host here means ads
// silently do not render, with an approved account and correct tag code. The
// AdSense dashboard reports this as no impressions and offers no diagnosis.
//
// The failure modes differ per directive, which is why all five are needed:
//   - script-src: pagead2 serves adsbygoogle.js itself. Blocked = nothing at
//     all happens, the only variant that is obvious in the console.
//   - frame-src: EVERY ad renders inside an iframe from googlesyndication or
//     doubleclick. This site had no frame-src at all, so it fell back to
//     `default-src 'self'` and would have blocked all of them while the script
//     loaded fine — slots present in the DOM, permanently empty. This is the
//     single most likely way to lose a week to a "why are there no ads" hunt.
//   - img-src: creatives and tracking pixels. Blocked = broken/blank ads that
//     still count as served, so it also depresses measured performance.
//   - connect-src: the ad request itself plus viewability beacons.
//   - fenced-frame-src: Chrome's Privacy Sandbox renders a growing share of
//     inventory in fenced frames, which do NOT fall back to frame-src. Absent
//     it, that slice goes blank on Chrome only — an intermittent, browser-
//     specific gap that looks like flaky fill rather than a policy error.
//
// tpc.googlesyndication.com is the third-party-cookie-less serving host and is
// separate from pagead2; adservice.google.com handles ad selection. Both are
// easy to omit because a first test impression can render without them.
//
// Kept as one list applied to several directives rather than five tuned ones:
// the hosts overlap heavily, ad serving moves between them without notice, and
// a directive-by-directive minimisation buys nothing against a party that
// already executes script on the page. The Sentry report-uri above is the
// backstop — an unlisted host arrives as a `blocked-host` issue.
const adsenseHostList = [
  "https://pagead2.googlesyndication.com",
  "https://*.googlesyndication.com",
  "https://tpc.googlesyndication.com",
  "https://googleads.g.doubleclick.net",
  "https://*.g.doubleclick.net",
  "https://*.doubleclick.net",
  "https://adservice.google.com",
  "https://*.adtrafficquality.google",

  // Google's certified CMP (Privacy & messaging → the GDPR consent message),
  // enabled 2026-08-10. It is delivered by adsbygoogle.js rather than by a
  // separate snippet, so there is nothing to add to the page — but it fetches
  // its message config and records the consent choice from its own hosts,
  // which no entry above covers.
  //
  // This is the most deceptive blocked-host case on the site, and the reason
  // it is added before anyone reports a problem: the CMP only renders for
  // EEA/UK/Swiss visitors. Blocked from here in India, the banner simply never
  // appears, every local check looks perfectly healthy, and the failure is
  // invisible to the only people who can see the feature. The consequence is
  // not a missing banner either — with no consent signal, ad serving to those
  // visitors is restricted, so it reads as an unexplained European revenue
  // hole rather than as a CSP error.
  //
  // fundingchoicesmessages.google.com serves the message itself (Funding
  // Choices is the product Google's CMP grew out of, hence the name).
  "https://fundingchoicesmessages.google.com",
  "https://*.fundingchoicesmessages.google.com",
];

const adsenseHosts = adsenseHostList.join(" ");

// Framing hosts are the ad hosts *plus* www.google.com, and that addition is
// not an oversight being corrected loosely — it was observed as a real
// violation in the console:
//
//   Framing 'https://www.google.com/' violates ... "frame-src ..."
//
// ep2.adtrafficquality.google embeds a www.google.com frame as part of
// Google's ad traffic quality / invalid-traffic verification. It is a
// different host from every serving host above, so no wildcard here covers
// it. Blocking it does not blank an ad the way a missing serving host does —
// which is worse, not better: the ads render, the verification silently
// fails, and the cost shows up as traffic quality problems on the account
// rather than as anything visibly wrong on the page.
//
// www.google.com already appears in the GA regional-signals list, but that
// list only ever reaches img-src and connect-src. Directives do not share
// entries, so it has to be named again here.
//
// consent.google.com is the CMP's own frame — the "Manage options" vendor
// list opens as an embedded frame from there rather than as page markup. It
// is framing-only, which is why it is here and not in adsenseHostList: the
// consent message itself renders fine without it, so blocking it breaks only
// the detailed-choices screen. That is the half of the banner the "as easy to
// refuse as to accept" requirement actually rests on, and it fails for EEA
// visitors only — see the note on the funding-choices hosts above.
const adsenseFrameHosts = [
  ...adsenseHostList,
  "https://www.google.com",
  "https://consent.google.com",
].join(" ");

// Ad serving follows the same production-only gate as the tag itself
// (lib/adsense.js). Opening these holes on previews would let a stray tag
// actually serve, which is the invalid-traffic risk that gate exists to
// prevent — so the policy and the component agree rather than the CSP being
// permanently wide and the component alone holding the line.
const adsEnabledForCsp = !process.env.VERCEL_ENV || process.env.VERCEL_ENV === "production";
const adsScriptSrc = adsEnabledForCsp ? ` ${adsenseHosts}` : "";
const adsFrameSrc = adsEnabledForCsp ? ` ${adsenseFrameHosts}` : "";
const adsImgSrc = adsEnabledForCsp ? ` ${adsenseHosts}` : "";
const adsConnectSrc = adsEnabledForCsp ? ` ${adsenseHosts}` : "";

const gaEnabled = Boolean(process.env.NEXT_PUBLIC_GA_ID);
const gaScriptSrc = gaEnabled ? " https://www.googletagmanager.com" : "";
const gaConnectSrc = gaEnabled
  ? ` ${gaCollectHosts} https://www.googletagmanager.com`
  : "";
const gaImgSrc = gaEnabled
  ? ` ${gaCollectHosts} https://www.googletagmanager.com`
  : "";

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}${gaScriptSrc}${adsScriptSrc}`,
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob:${gaImgSrc}${adsImgSrc}`,
      "font-src 'self' data:",
      `connect-src 'self' https://*.supabase.co https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io${gaConnectSrc}${adsConnectSrc}`,
      // Ad iframes. Omitted entirely when ads are off, so the policy keeps
      // falling back to default-src 'self' and stays as tight as before —
      // this site embeds no other third-party frames.
      ...(adsFrameSrc ? [`frame-src 'self'${adsFrameSrc}`] : []),
      // Privacy Sandbox fenced frames do not inherit frame-src, so Chrome
      // needs this named separately or that inventory renders blank there.
      ...(adsFrameSrc ? [`fenced-frame-src${adsFrameSrc}`] : []),
      "worker-src 'self' blob:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "upgrade-insecure-requests",
      ...(reportUri ? [`report-uri ${reportUri}`] : []),
    ].join("; "),
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

// Blog posts are .mdx files compiled at build time (see src/lib/blogPosts.js).
// `pageExtensions` is deliberately NOT widened to include mdx: posts live in
// src/content/blog and are imported by the [slug] route, they are not routes
// themselves. Adding "mdx" here would make any stray .mdx file under src/app a
// live URL, which is a surprising thing for a content file to be.
const withMdx = createMdx({
  options: {
    // remark-gfm is not optional garnish. MDX's core is CommonMark, which has
    // no tables, no strikethrough, and no autolinks — so a pipe table in a
    // post renders as a literal paragraph of `| a | b |` text. It looks like
    // an authoring mistake rather than a missing plugin, and it shipped that
    // way in the first post here before the built HTML was checked.
    //
    // Nothing else is added. Syntax highlighting and heading-anchor plugins
    // would each pull a dependency in for a blog with no post yet needing one,
    // and anchors are already handled for free in the MDX component map.
    //
    // Named as a STRING, not as an imported function. This project builds with
    // Turbopack, which serializes loader options to pass them to its Rust
    // core — a function reference is not serializable and fails the build
    // outright with "does not have serializable options". The string form is
    // resolved by Turbopack itself. An imported binding works under webpack,
    // so this is exactly the kind of thing that looks correct in a tutorial
    // and breaks here.
    remarkPlugins: [["remark-gfm", {}]],
    rehypePlugins: [],
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },

  // Permanent redirects for tools that have moved.
  //
  // A moved tool cannot simply change href: the old URL was live, is in the
  // sitemap Google has already fetched, and may sit in someone's bookmarks or
  // an inbound link. Dropping it would turn all of that into a 404 and throw
  // away whatever ranking the page had earned, so the old path 308s to the new
  // one and passes its signals along.
  //
  // `permanent: true` emits a 308 (not a 301), which preserves the method and
  // is what Next uses for permanent moves. Browsers and search engines cache
  // it aggressively — which is the point, and also why an entry here should
  // not be removed once shipped.
  async redirects() {
    return [
      {
        // JPG to PDF moved from the Image category to PDF on 2026-08-06: the
        // output is a PDF, and it belongs beside PDF to JPG rather than beside
        // the image editors. Shipped at the old path first, hence the redirect.
        source: "/image/to-pdf",
        destination: "/pdf/jpg-to-pdf",
        permanent: true,
      },
    ];
  },
};

export default withSentryConfig(withMdx(nextConfig), {
  silent: true,
  // No org/project/authToken here — sourcemap upload is opt-in once
  // SENTRY_ORG/SENTRY_PROJECT/SENTRY_AUTH_TOKEN are set in the environment.
  widenClientFileUpload: true,
});
