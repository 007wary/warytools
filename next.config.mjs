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
// scripts/styles only need 'self' (+ 'unsafe-inline' for Next's inline
// bootstrap/style tags) and connect-src only needs to reach Supabase and
// Sentry (error reporting from the browser).
const reportUri = sentryCspReportUri();

// React's dev-mode overlay uses eval() to reconstruct stack traces across
// module boundaries; it never does this in production builds, so
// 'unsafe-eval' is added only when running `next dev`.
const isDev = process.env.NODE_ENV === "development";

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io",
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
};

export default withSentryConfig(nextConfig, {
  silent: true,
  // No org/project/authToken here — sourcemap upload is opt-in once
  // SENTRY_ORG/SENTRY_PROJECT/SENTRY_AUTH_TOKEN are set in the environment.
  widenClientFileUpload: true,
});
