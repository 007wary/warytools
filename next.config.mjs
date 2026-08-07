import { withSentryConfig } from "@sentry/nextjs";

// Sentry can ingest CSP violation reports on the same DSN used for error
// tracking (its "security header endpoint"), so violations show up
// alongside JS errors with no separate reporting infra. Derived from the
// DSN's own host/key/project-id rather than hardcoded, so it stays correct
// if the DSN rotates and disappears cleanly (report-uri omitted) if unset.
function sentryCspReportUri() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return null;

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
];

const gaCollectHosts = [
  "https://www.google-analytics.com",
  "https://*.google-analytics.com",
  "https://analytics.google.com",
  "https://*.analytics.google.com",
  ...gaSignalsHosts,
  ...gaRegionalSignalsHosts,
].join(" ");

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
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}${gaScriptSrc}`,
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob:${gaImgSrc}`,
      "font-src 'self' data:",
      `connect-src 'self' https://*.supabase.co https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io${gaConnectSrc}`,
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

export default withSentryConfig(nextConfig, {
  silent: true,
  // No org/project/authToken here — sourcemap upload is opt-in once
  // SENTRY_ORG/SENTRY_PROJECT/SENTRY_AUTH_TOKEN are set in the environment.
  widenClientFileUpload: true,
});
