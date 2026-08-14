import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,

  // Same reasoning as the server config. Nothing on this site currently runs
  // on the edge runtime — every route sets `runtime = "nodejs"` — so this
  // file initialises a client that reports nothing today.
  //
  // It is set anyway, and that is the point: the three configs should not
  // disagree about whether PII is collected. A route moved to the edge later
  // would otherwise silently pick up a different posture from the one its
  // author had read in sentry.server.config.js.
  sendDefaultPii: false,
});
