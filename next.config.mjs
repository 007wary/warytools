import createMdx from "@next/mdx";
import { withSentryConfig } from "@sentry/nextjs";

// Relative, not "@/lib/…": the path alias is a bundler concern and this file is
// evaluated by Node before any of that exists.
import {
  adsAllowedInCsp,
  cspReportingEnabled,
  sentryCspReportUri as buildSentryCspReportUri,
} from "./src/lib/cspReporting.mjs";

// Sentry can ingest CSP violation reports on the same DSN used for error
// tracking (its "security header endpoint"), so violations show up
// alongside JS errors with no separate reporting infra. Derived from the
// DSN's own host/key/project-id rather than hardcoded, so it stays correct
// if the DSN rotates and disappears cleanly (report-uri omitted) if unset.
//
// The decision itself lives in src/lib/cspReporting.mjs so it can be tested
// against a supplied env object; this file only reads process.env and passes
// the result through. See the note there on why that split exists.
function sentryCspReportUri() {
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
  // Follows robots.js's isNonCanonicalDeploy() in spirit, but is deliberately
  // STRICTER, and the difference is what actually stopped the noise.
  //
  // This gate has now been wrong TWICE, both times by trying to infer whether
  // the build is on Vercel and treating "can't tell" as canonical:
  //
  //   1. `vercelEnv && vercelEnv !== "production"` — an unset VERCEL_ENV counts
  //      as canonical. Correct for robots.txt, where guessing wrong costs a lost
  //      page; inverted here, where it costs a flood of unfixable reports.
  //   2. Adding VERCEL_URL/VERCEL to the detection, on the assumption that at
  //      least one survives where VERCEL_ENV doesn't. It doesn't: preview
  //      violations kept arriving a full day after that shipped, and the
  //      *.vercel.app reports of 2026-08-14 prove it — their captured policy
  //      contains BOTH this report-uri AND every AdSense host, which is only
  //      reachable when all three variables are absent and both gates take the
  //      production branch.
  //
  // So the inference is abandoned rather than refined a third time. Reporting
  // now requires a positive VERCEL_ENV === "production" and nothing else can
  // enable it implicitly. The asymmetry is deliberate: a missing report costs
  // one lost violation on a host we control and can re-check by hand, while a
  // wrongly-emitted one costs an unfixable stream that buries the reports from
  // wary.tools — which is the failure that actually happened, twice.
  //
  // CSP_REPORT_URI_ENABLED=1 is the escape hatch for a genuine self-hosted
  // deploy that wants reporting. Opt-in, because a self-hosted build cannot be
  // told apart from a Vercel preview by any variable this file can read, and
  // only one of those two should report by default.
  if (!cspReportingEnabled(process.env)) return null;

  return buildSentryCspReportUri(process.env.NEXT_PUBLIC_SENTRY_DSN);
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

  // AdSense's own performance beacon. rum_fy2021.js — loaded from pagead2 as
  // part of adsbygoogle.js — POSTs page timing to csi.gstatic.com/csi. Arrived
  // as a real connect-src blocked-host report from three visitors rather than
  // being guessed, which is the workflow the report-uri above exists for.
  //
  // gstatic.com is Google's static-asset domain and is a different registrable
  // domain from every serving host listed above, so no wildcard here reaches
  // it. Listed as the exact host rather than `*.gstatic.com`: this is the only
  // gstatic host the ad stack contacts from this site, and the wildcard would
  // also cover fonts/, maps/ and the rest of Google's static estate for no
  // benefit.
  //
  // Blocking it costs no revenue and blanks no ad — which is precisely why it
  // is worth fixing rather than ignoring. It reports nothing but latency, so
  // the only visible consequence is a permanent trickle of CSP issues burying
  // the reports that do matter. It belongs in connect-src only, but is kept in
  // the shared list for the reason given above: the hosts overlap, and a
  // directive-by-directive split buys nothing against a party already running
  // script on the page.
  "https://csi.gstatic.com",
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
//
// This deliberately mirrors lib/adsense.js's `!vercelEnv || vercelEnv ===
// "production"` EXACTLY, rather than the stricter shape used by the report-uri
// gate above, and the difference between the two is the point.
//
// The previous version tried to detect Vercel via VERCEL_URL/VERCEL so that a
// preview with no VERCEL_ENV would close the ad hosts. That detection does not
// work — see the note in sentryCspReportUri() — so it bought nothing, and it
// also put this gate one edit away from disagreeing with the component it is
// supposed to track. A CSP that closes ad hosts while adsense.js renders the
// tag is the blank-inventory failure documented at length above, and it is
// invisible locally.
//
// So the policy follows the component: whatever adsEnabled() decides, this
// matches, and lib/adsense.js remains the single place that decision is made.
// On a preview that exposes VERCEL_ENV both correctly close. On one that does
// not, both stay open — the policy permits hosts the tag then declines to use,
// which serves no ad and is the harmless direction of the two.
const adsEnabledForCsp = adsAllowedInCsp(process.env);
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

  // Severs the link between this page and any window it opens or is opened by,
  // so neither gets a `window.opener` handle to the other. `frame-ancestors`
  // and X-Frame-Options above cover being *embedded*; this covers the other
  // direction, which they say nothing about.
  //
  // `same-origin-allow-popups`, NOT `same-origin`, and the difference is
  // load-bearing here. Plain `same-origin` also severs popups this page opens
  // deliberately, which breaks Google's CMP: the consent flow's "Manage
  // options" screen and the account chooser open as popups from
  // consent.google.com and need their opener to post the consent choice back.
  // Under `same-origin` the popup opens, the visitor makes a choice, and
  // nothing is recorded — a failure visible only to EEA/UK/Swiss visitors, for
  // exactly the reason the funding-choices CSP note above gives. The
  // allow-popups variant keeps every protection that matters (nothing can
  // reach *into* this page) while letting a popup this page opened talk back.
  //
  // Every outbound link here already sets rel="noopener" individually, so this
  // is defence in depth rather than a fix — it means a link added later
  // without it is still safe.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },

  // Stops other sites embedding this origin's responses as a subresource
  // (<img>, <script>, <iframe>). Nothing here is meant to be hotlinked, and it
  // closes the Spectre-adjacent side channel where a cross-origin page pulls a
  // response into its own process to measure it.
  //
  // `same-origin` is safe for the site's own pages and scripts because
  // nothing here is meant to be embedded by a third party: no oEmbed, no
  // public image CDN, no widget.
  //
  // Social preview images are the deliberate exception and are overridden to
  // `cross-origin` in headers() below. They are the one class of asset whose
  // entire purpose is being displayed on someone else's domain. A crawler
  // that merely fetches the URL is unaffected either way — CORP governs
  // subresource embedding, not direct requests — but several preview
  // surfaces (Slack, Discord, and Twitter's card renderer) load the image
  // into a rendered page, where it *is* a cross-origin subresource and CORP
  // applies. `/opengraph-image` already answers with
  // `Access-Control-Allow-Origin: *`, which is a separate mechanism and does
  // NOT satisfy CORP, so without the override the card silently stops
  // rendering on those surfaces while looking perfectly fine in a curl.
  //
  // NOTE: Cross-Origin-Embedder-Policy is deliberately NOT set. `require-corp`
  // would demand a CORP header from every cross-origin subresource, and the ad
  // stack serves creatives and frames from hosts that send none — so it would
  // blank the entire ad inventory site-wide, reported by AdSense as zero
  // impressions with no diagnosis. That is the same silent-failure class the
  // frame-src note above describes. COEP buys nothing here anyway: its purpose
  // is unlocking SharedArrayBuffer via cross-origin isolation, and nothing on
  // this site uses it (the PDF and image workers use plain postMessage with
  // transferable ArrayBuffers, which needs no isolation).
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
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
    // remark-frontmatter is what stops the `---` header being RENDERED. The
    // MDX compiler has no concept of frontmatter: without this it parses the
    // opening `---` as a thematic break and the `title:`/`description:` lines
    // as ordinary paragraph text, so every post opened with its own metadata
    // printed as a heading. blogPosts.js strips the block for its own parsing,
    // but PostBody.js imports the raw .mdx through this compiler, so the two
    // paths need telling separately.
    //
    // It is declared BEFORE remark-gfm: frontmatter must be recognised while
    // the `---` delimiters are still at the top of the document, ahead of any
    // plugin that rewrites block structure.
    //
    // The plugin only *parses* the block into a node — mdx still renders
    // unknown nodes as nothing, which is the desired outcome here since the
    // values are already read by blogPosts.js.
    remarkPlugins: [["remark-frontmatter", ["yaml"]], ["remark-gfm", {}]],
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

      // Social preview images, relaxed back to `cross-origin`.
      //
      // These override the site-wide `Cross-Origin-Resource-Policy:
      // same-origin` set above, and must come AFTER it — for a header both
      // rules match, the later entry wins. Their whole purpose is to be
      // rendered on another domain (a Slack unfurl, a Twitter card, a
      // Facebook share), which is precisely what `same-origin` forbids.
      //
      // Scoped to images only, and named rather than wildcarded: this is a
      // deliberate hole, so it should cover exactly the files that need it.
      // - /opengraph-image and /apple-icon.png are Next's generated metadata
      //   routes from src/app.
      // - /blog/* covers per-post covers in public/blog, declared by a post's
      //   `cover:` frontmatter and used for og:image and the JSON-LD image.
      {
        source: "/opengraph-image",
        headers: [{ key: "Cross-Origin-Resource-Policy", value: "cross-origin" }],
      },
      {
        source: "/apple-icon.png",
        headers: [{ key: "Cross-Origin-Resource-Policy", value: "cross-origin" }],
      },
      {
        source: "/icon-512.png",
        headers: [{ key: "Cross-Origin-Resource-Policy", value: "cross-origin" }],
      },
      {
        // Blog covers. The Organization JSON-LD's `logo` and every post's
        // og:image live under here or above; a crawler that cannot load them
        // falls back to no preview image at all.
        source: "/blog/:file*.(jpg|jpeg|png|webp|gif)",
        headers: [{ key: "Cross-Origin-Resource-Policy", value: "cross-origin" }],
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
      {
        // The newsletter moved from double to single opt-in on 2026-08-13, so
        // /newsletter/confirm no longer exists. The same "a live URL cannot
        // just vanish" rule applies as for a moved tool, and here it is
        // sharper than usual: confirmation links were already delivered to
        // real inboxes, and a 404 would tell someone who is *already
        // subscribed* that their subscription failed. Sending them to the blog
        // is the honest landing — they are on the list and there is nothing
        // for them to do.
        //
        // 307 rather than 308: this is a temporary courtesy for tokens that
        // expire three days after the last confirmation email went out, not a
        // permanent fact about the URL space. A cached-forever 308 would
        // outlive the reason for it.
        source: "/newsletter/confirm",
        destination: "/blog",
        permanent: false,
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
