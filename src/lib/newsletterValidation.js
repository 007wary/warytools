// Validation and error copy for the newsletter subscription form.
//
// Per CLAUDE.md, logic that guards a user input lives in src/lib/ rather than
// inline in the client, so it can actually be tested. Both the client (fast,
// inline feedback) and /api/newsletter/subscribe import from here, which is
// what keeps the message a user sees identical on both sides of the network.
//
// Unlike the shortener, there is no SQL mirror to keep in sync. The anon role
// has no INSERT on newsletter_subscribers and the subscribe RPC stores whatever
// address it is handed, so this module is the only gate on address *shape* —
// but note carefully what that does and does not mean. It is not a security
// boundary in the shortener's sense, because a malformed address can only ever
// produce a bounce, never a leak: the confirm step (see newsletterToken.js) is
// what stops an unconfirmed address ever receiving a post. Getting a junk row
// into the table costs one bounced confirmation email and nothing else.

export const MAX_EMAIL_LENGTH = 254; // RFC 5321 address ceiling

// Reasons are codes, not sentences, so the caller decides the wording — the
// same shape contactValidation.js and urlShortenerValidation.js use.
export const SubscribeRejection = {
  EMAIL_EMPTY: "email_empty",
  EMAIL_TOO_LONG: "email_too_long",
  EMAIL_MALFORMED: "email_malformed",
  SPAM: "spam",
};

export const REJECTION_MESSAGES = {
  [SubscribeRejection.EMAIL_EMPTY]: "Please enter an email address.",
  [SubscribeRejection.EMAIL_TOO_LONG]: "That email address is too long.",
  [SubscribeRejection.EMAIL_MALFORMED]:
    "That doesn't look like a valid email address.",
  // The honeypot never tells the bot what it tripped — a specific message is
  // free feedback for tuning around it. Same reasoning as contactValidation.
  [SubscribeRejection.SPAM]: "That didn't go through. Please try again.",
};

export function rejectionMessage(reason) {
  return REJECTION_MESSAGES[reason] || REJECTION_MESSAGES[SubscribeRejection.SPAM];
}

// Deliberately permissive, and identical in spirit to contactValidation's.
// A stricter regex is a well-known way to reject real addresses
// (plus-addressing, new TLDs, apostrophes in the local part), and the only
// thing that actually proves an address works is mail arriving at it — which
// here is precisely what the double opt-in confirmation *is*. So this catches
// the typo shapes (no @, no dot in the domain, whitespace) and lets the
// confirmation email be the real check.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

// CR/LF in an address that ends up in a mail header is the classic header
// injection vector. Every address here is interpolated into a `To:` header by
// Resend, so this is checked even though EMAIL_PATTERN's \s class already
// excludes them — belt and braces on the one field that reaches a header.
const HEADER_UNSAFE = /[\r\n]/;

/**
 * Normalizes an address for storage and comparison.
 *
 * Case-folded and trimmed, because the local part is technically
 * case-sensitive per RFC 5321 but no mail provider in practice treats it that
 * way — and storing both "Wary@x.com" and "wary@x.com" means one person gets
 * every post twice and has to unsubscribe twice. The unique index in Postgres
 * is on this normalized form, so normalizing here is what makes the constraint
 * mean "one person" rather than "one spelling".
 *
 * Note this deliberately does NOT strip Gmail's dots or +tags. Those rules are
 * provider-specific, not standard, and applying them universally would merge
 * two genuinely different addresses at providers that treat them as distinct.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/**
 * Validates one subscription request and returns the normalized payload.
 *
 * Returns a discriminated result rather than throwing, so the route can map the
 * reason onto a status and the client onto an inline message — the same
 * convention as checkSubmission() and parseNumber().
 *
 * @param {{email?: unknown, website?: unknown}} input
 * @returns {{ok: true, value: {email: string}} | {ok: false, reason: string}}
 */
export function checkSubscription(input) {
  const raw = input && typeof input === "object" ? input : {};

  // The honeypot, checked first so a bot costs us no further work. It is a
  // hidden field people never see and never fill; anything in it is automated.
  if (typeof raw.website === "string" && raw.website.trim() !== "") {
    return { ok: false, reason: SubscribeRejection.SPAM };
  }

  const email = normalizeEmail(raw.email);

  if (email === "") return { ok: false, reason: SubscribeRejection.EMAIL_EMPTY };

  // Length is checked before the pattern so a megabyte of text gets a cheap
  // rejection rather than being run through a regex.
  if (email.length > MAX_EMAIL_LENGTH) {
    return { ok: false, reason: SubscribeRejection.EMAIL_TOO_LONG };
  }

  if (HEADER_UNSAFE.test(email) || !EMAIL_PATTERN.test(email)) {
    return { ok: false, reason: SubscribeRejection.EMAIL_MALFORMED };
  }

  return { ok: true, value: { email } };
}
