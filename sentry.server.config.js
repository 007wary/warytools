import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,

  // Same reasoning as sentry.client.config.js, and set here for a different
  // reason than it is there. The Node SDK registers no IP-attachment hook at
  // all — the `{{auto}}` path exists only in @sentry/browser — so there is no
  // default to correct on this side.
  //
  // What this guards is the rest of the flag's surface, which matters more on
  // the server than in the browser: at `true` it attaches request headers and
  // bodies to events. Every route here captures exceptions (contact,
  // newsletter, the four converters), so that would mean a submitter's name,
  // email and message, or a subscriber's address, riding along with any error
  // — and the newsletter's whole design is that the list is never readable
  // from anywhere but the service role.
  sendDefaultPii: false,
});
