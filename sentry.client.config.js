import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,

  // Pins the no-PII posture rather than inheriting it. This is the browser
  // SDK, and it is the ONLY one of the three that has an IP-attachment path:
  // @sentry/browser's client registers `addAutoIpAddressToSession` — which
  // stamps `ip_address: "{{auto}}"`, the token telling Sentry's ingestion
  // server to fill in the real IP from the connecting socket — and that
  // registration is gated on the resolved `userInfo` option. With
  // sendDefaultPii unset, `defaultPiiToCollectionOptions` resolves userInfo
  // to false, so nothing was being attached and this changes no behaviour
  // today.
  //
  // It is set explicitly because the site's privacy claim should not rest on
  // an SDK default. Every API route goes out of its way to salt-and-hash the
  // caller's IP before it reaches Postgres (see rateLimitDb.js), so a default
  // flipping in a future major version would quietly undo that at the error
  // reporter while every route still looked careful — and it would arrive
  // looking like ordinary error reports, with nothing failing.
  //
  // The flag does more than IPs: at `true` it also turns on cookies, request
  // and response headers and bodies, and URL query params. On a site whose
  // tools handle people's documents, that is the wrong direction by default.
  sendDefaultPii: false,
});
