// Validation and error copy for the contact form.
//
// Per CLAUDE.md, logic that guards a user input lives in src/lib/ rather than
// inline in the client, so it can actually be tested. Both the client (fast,
// inline feedback) and /api/contact (the gate that counts) import from here,
// which is what keeps the message a user sees identical on both sides of the
// network.
//
// Unlike the shortener, there is no SQL mirror to keep in sync: the route is a
// real boundary here, because the Resend API key is server-only and there is no
// public path to the mail send. The route's copy of these checks is the only
// one that matters; the client's is a courtesy.

export const MAX_NAME_LENGTH = 80;
export const MAX_EMAIL_LENGTH = 254; // RFC 5321 address ceiling
export const MAX_MESSAGE_LENGTH = 4000;
export const MIN_MESSAGE_LENGTH = 10;

// Reasons are codes, not sentences, so the caller decides the wording — the
// same shape urlShortenerValidation.js uses. It also lets the client tell
// "not finished typing" apart from "definitely wrong" without the message
// text becoming the API.
export const ContactRejection = {
  NAME_EMPTY: "name_empty",
  NAME_TOO_LONG: "name_too_long",
  EMAIL_EMPTY: "email_empty",
  EMAIL_TOO_LONG: "email_too_long",
  EMAIL_MALFORMED: "email_malformed",
  MESSAGE_EMPTY: "message_empty",
  MESSAGE_TOO_SHORT: "message_too_short",
  MESSAGE_TOO_LONG: "message_too_long",
  HEADER_INJECTION: "header_injection",
  SPAM: "spam",
};

export const REJECTION_MESSAGES = {
  [ContactRejection.NAME_EMPTY]: "Please tell us your name.",
  [ContactRejection.NAME_TOO_LONG]: `Your name is longer than ${MAX_NAME_LENGTH} characters.`,
  [ContactRejection.EMAIL_EMPTY]: "Please add an email address so we can reply.",
  [ContactRejection.EMAIL_TOO_LONG]: "That email address is too long.",
  [ContactRejection.EMAIL_MALFORMED]: "That doesn't look like a valid email address.",
  [ContactRejection.MESSAGE_EMPTY]: "Please write a message.",
  [ContactRejection.MESSAGE_TOO_SHORT]: `Please add a bit more detail — at least ${MIN_MESSAGE_LENGTH} characters.`,
  [ContactRejection.MESSAGE_TOO_LONG]: `Your message is longer than ${MAX_MESSAGE_LENGTH} characters. Please trim it down.`,
  [ContactRejection.HEADER_INJECTION]:
    "Your name or email contains a line break, which isn't allowed.",
  [ContactRejection.SPAM]: "That message couldn't be sent. Please try again.",
};

// Deliberately permissive. A stricter regex is a well-known way to reject real
// addresses (plus-addressing, new TLDs, apostrophes in the local part), and the
// only thing that actually proves an address works is mail arriving at it. This
// catches the typo cases — no @, no dot in the domain, whitespace — and lets
// everything else through to Resend, which does the real check.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

// CR/LF in a field that ends up in a mail header is the classic header
// injection vector: "a@b.com\nBcc: victim@example.com" turns our reply-to into
// someone else's mailing list. We put the name and address into Reply-To and
// the subject line, so both are checked. The message body is not — it's a body,
// newlines are the point, and it never touches a header.
const HEADER_UNSAFE = /[\r\n]/;

// Bare-minimum spam heuristics. This is not a spam filter and shouldn't grow
// into one — the rate limit is the real defence. It only catches the two shapes
// that dominate unfiltered contact forms: a message that is mostly links, and
// the honeypot field below.
const LINK_PATTERN = /https?:\/\//gi;
const MAX_LINKS = 4;

function countLinks(text) {
  return (text.match(LINK_PATTERN) || []).length;
}

/**
 * Validates one submission and returns the normalized payload.
 *
 * Returns a discriminated result rather than throwing, so the route can map the
 * reason onto a status and the client onto an inline message — the same
 * convention as checkUrl() and parseNumber().
 *
 * @param {{name?: unknown, email?: unknown, message?: unknown, website?: unknown}} input
 * @returns {{ok: true, value: {name: string, email: string, message: string}}
 *          | {ok: false, reason: string}}
 */
export function checkSubmission(input) {
  const name = typeof input?.name === "string" ? input.name.trim() : "";
  const email = typeof input?.email === "string" ? input.email.trim() : "";
  const message = typeof input?.message === "string" ? input.message.trim() : "";

  // Honeypot: a field hidden from people but filled in by naive bots that
  // complete every input they find. Checked first and reported as generic spam,
  // never as "you filled the hidden field" — telling a bot how it was caught is
  // how the check stops working.
  const honeypot = typeof input?.website === "string" ? input.website.trim() : "";
  if (honeypot.length > 0) {
    return { ok: false, reason: ContactRejection.SPAM };
  }

  if (name.length === 0) return { ok: false, reason: ContactRejection.NAME_EMPTY };
  if (name.length > MAX_NAME_LENGTH) {
    return { ok: false, reason: ContactRejection.NAME_TOO_LONG };
  }

  if (email.length === 0) return { ok: false, reason: ContactRejection.EMAIL_EMPTY };
  if (email.length > MAX_EMAIL_LENGTH) {
    return { ok: false, reason: ContactRejection.EMAIL_TOO_LONG };
  }
  if (!EMAIL_PATTERN.test(email)) {
    return { ok: false, reason: ContactRejection.EMAIL_MALFORMED };
  }

  // Checked after the shape tests so a pasted address with a stray newline
  // reports the specific problem rather than a generic "invalid email".
  if (HEADER_UNSAFE.test(name) || HEADER_UNSAFE.test(email)) {
    return { ok: false, reason: ContactRejection.HEADER_INJECTION };
  }

  if (message.length === 0) return { ok: false, reason: ContactRejection.MESSAGE_EMPTY };
  if (message.length < MIN_MESSAGE_LENGTH) {
    return { ok: false, reason: ContactRejection.MESSAGE_TOO_SHORT };
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, reason: ContactRejection.MESSAGE_TOO_LONG };
  }

  if (countLinks(message) > MAX_LINKS) {
    return { ok: false, reason: ContactRejection.SPAM };
  }

  return { ok: true, value: { name, email, message } };
}

export function rejectionMessage(reason) {
  return REJECTION_MESSAGES[reason] || "That message couldn't be sent. Please try again.";
}

/**
 * Builds the subject line for the notification email.
 *
 * The sender's name goes in the subject so an inbox list is scannable, but it's
 * user input landing in a header — so it's length-clamped and stripped of the
 * control characters that checkSubmission already rejects. Belt and braces:
 * this function is also reachable from tests and any future caller that hasn't
 * validated first.
 *
 * @param {string} name
 * @returns {string}
 */
export function notificationSubject(name) {
  const safe = String(name || "")
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, MAX_NAME_LENGTH);

  return safe ? `WaryTools contact — ${safe}` : "WaryTools contact";
}

/**
 * Escapes a string for interpolation into the HTML email body.
 *
 * The message is user-authored text rendered as HTML in whatever mail client
 * opens it. Without this, a message containing markup is rendered as markup —
 * and a contact form that renders attacker HTML into the operator's inbox is a
 * phishing delivery mechanism aimed at us.
 *
 * @param {string} value
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
