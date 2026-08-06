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
const gaEnabled = Boolean(process.env.NEXT_PUBLIC_GA_ID);
const gaScriptSrc = gaEnabled ? " https://www.googletagmanager.com" : "";
const gaConnectSrc = gaEnabled
  ? " https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com"
  : "";
const gaImgSrc = gaEnabled
  ? " https://www.google-analytics.com https://*.google-analytics.com https://www.googletagmanager.com"
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
