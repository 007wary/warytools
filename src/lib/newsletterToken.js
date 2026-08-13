// Signed, self-contained tokens for the unsubscribe links in every email.
//
// These links are clicked from an email client, by someone with no session and
// no account, so the token in the URL *is* the entire proof of authorization.
// That makes this file the security boundary for the newsletter, in the same
// way the database is for the shortener.
//
// A CONFIRM purpose used to live here too, for a double opt-in flow that has
// since been replaced by single opt-in (a subscription is live on submit, and
// the welcome email reports it rather than gating it). The purpose field is
// KEPT even though only one value is currently minted: it is inside the
// signature, so a future second link type cannot be forged from an unsubscribe
// token, and removing it would silently make every existing token
// interchangeable with whatever came next.
//
// The shape is a compact HMAC-signed triple:
//
//     <purpose>.<email-b64url>.<expiry>.<signature>
//
// deliberately not a JWT. A JWT would mean a dependency, a header declaring its
// own algorithm, and the whole `alg: none` family of downgrade bugs — for a
// payload of one email address and one timestamp. Everything here is
// node:crypto.
//
// Three properties are load-bearing, and each has a test:
//
//   - The signature covers the purpose. Without it a confirm token is a valid
//     unsubscribe token and vice versa, so a link that says "yes, subscribe me"
//     could be replayed to remove someone. Purpose is signed, not just
//     prefixed.
//   - The signature covers the expiry. An unsigned expiry is a suggestion: the
//     recipient edits the number in their own URL bar and the token is
//     immortal.
//   - Comparison is timingSafeEqual, never `===`. A byte-by-byte string compare
//     leaks how much of a forged signature was correct, which over enough
//     attempts is how a signature gets forged one character at a time.

import { createHmac, timingSafeEqual } from "crypto";

// Unsubscribe links must outlive the email they are in — people unsubscribe
// from a post they finally opened months later, and an expired unsubscribe
// link is both infuriating and, under CAN-SPAM/GDPR, the one link that is not
// optional. So it does not expire.
//
// The expiry machinery below is kept rather than deleted, because it is inside
// the signature: dropping it would change the signed payload shape and
// invalidate every unsubscribe link already sitting in someone's inbox.
export const NO_EXPIRY = 0;

// A reinstatement link IS short-lived, unlike an unsubscribe link, and the
// asymmetry is deliberate. This token re-adds an address to a list its owner
// deliberately left, so it is the one link here that grants rather than
// revokes — an immortal one sitting in an old inbox is a standing invitation
// to resubscribe someone who opted out. Three days matches how long a person
// plausibly takes to notice the email.
export const RESUBSCRIBE_TTL_SECONDS = 3 * 24 * 60 * 60;

export const TokenPurpose = {
  UNSUBSCRIBE: "unsubscribe",
  RESUBSCRIBE: "resubscribe",
};

export const TokenError = {
  MALFORMED: "malformed",
  BAD_SIGNATURE: "bad_signature",
  EXPIRED: "expired",
  WRONG_PURPOSE: "wrong_purpose",
};

// base64url, hand-rolled rather than pulled from a library because Node's
// "base64url" encoding is available but the decode side still needs the
// padding restored on some runtimes. Standard base64 is unusable here: `+`
// and `/` are meaningful in a URL path and `=` gets percent-encoded by some
// mail clients when they rewrite links, which would silently break every
// token that happened to need padding.
function encodeBase64Url(value) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function decodeBase64Url(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64").toString("utf8");
}

/**
 * The signing secret.
 *
 * Read at call time rather than at module scope so a test can set it and so a
 * missing value fails loudly at the point of use rather than at import — these
 * modules are imported during a static build, where throwing on an unset env
 * var would break `npm run build` for anyone without the secret.
 *
 * Server-only, deliberately not NEXT_PUBLIC_: this secret in the browser
 * bundle would let anyone mint an unsubscribe token for any address on the
 * list, which is a remote-wipe button on the mailing list.
 */
function signingSecret() {
  const secret = process.env.NEWSLETTER_TOKEN_SECRET;
  if (!secret) throw new Error("NEWSLETTER_TOKEN_SECRET is not set");
  return secret;
}

function sign(payload) {
  return createHmac("sha256", signingSecret()).update(payload).digest("base64url");
}

/**
 * Mints a token.
 *
 * @param {string} purpose  One of TokenPurpose.
 * @param {string} email    Already normalized (see newsletterValidation).
 * @param {number} ttlSeconds  Seconds until expiry, or NO_EXPIRY for none.
 * @param {number} [now]    Epoch ms, injectable for tests.
 * @returns {string}
 */
export function createToken(purpose, email, ttlSeconds, now = Date.now()) {
  const expiry =
    ttlSeconds === NO_EXPIRY ? 0 : Math.floor(now / 1000) + ttlSeconds;

  // The email is encoded, never raw: an address contains characters (`+`, and
  // legally `/` in a quoted local part) that would otherwise be swallowed by
  // URL parsing or collide with the `.` delimiter.
  const payload = `${purpose}.${encodeBase64Url(email)}.${expiry}`;
  return `${payload}.${sign(payload)}`;
}

/**
 * Verifies a token and returns the address it names.
 *
 * @param {unknown} token
 * @param {string} expectedPurpose
 * @param {number} [now] Epoch ms, injectable for tests.
 * @returns {{ok: true, email: string} | {ok: false, reason: string}}
 */
export function verifyToken(token, expectedPurpose, now = Date.now()) {
  if (typeof token !== "string" || token === "") {
    return { ok: false, reason: TokenError.MALFORMED };
  }

  const parts = token.split(".");
  if (parts.length !== 4) return { ok: false, reason: TokenError.MALFORMED };

  const [purpose, encodedEmail, expiryText, signature] = parts;
  const payload = `${purpose}.${encodedEmail}.${expiryText}`;

  // Signature is checked BEFORE the expiry and before the purpose, and before
  // the payload is decoded. Everything after this point treats the payload as
  // our own data; checking any of it first would mean acting on attacker-
  // controlled input (including feeding arbitrary bytes to the base64 decoder)
  // ahead of establishing that we wrote it.
  let expected;
  try {
    expected = sign(payload);
  } catch {
    // Secret unset. Refuse rather than accept — a newsletter that unsubscribes
    // nobody because it is misconfigured is a bug; one that accepts unsigned
    // tokens because it is misconfigured is a breach.
    return { ok: false, reason: TokenError.BAD_SIGNATURE };
  }

  const givenBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);

  // timingSafeEqual throws on a length mismatch, so the lengths are compared
  // first. That comparison is not itself a leak: the signature length is a
  // constant of the algorithm, not a secret.
  if (
    givenBytes.length !== expectedBytes.length ||
    !timingSafeEqual(givenBytes, expectedBytes)
  ) {
    return { ok: false, reason: TokenError.BAD_SIGNATURE };
  }

  if (purpose !== expectedPurpose) {
    return { ok: false, reason: TokenError.WRONG_PURPOSE };
  }

  // Only reachable for an expiry we signed, so a non-numeric value here means
  // our own minting is broken rather than that someone tampered.
  const expiry = Number(expiryText);
  if (!Number.isFinite(expiry)) return { ok: false, reason: TokenError.MALFORMED };

  if (expiry !== 0 && Math.floor(now / 1000) > expiry) {
    return { ok: false, reason: TokenError.EXPIRED };
  }

  const email = decodeBase64Url(encodedEmail);
  if (email === "") return { ok: false, reason: TokenError.MALFORMED };

  return { ok: true, email };
}

/**
 * The absolute unsubscribe URL that goes in every email.
 *
 * Built here rather than inline in the templates so the token shape and the
 * route path can never disagree, and so a test can assert the link a
 * subscriber actually receives.
 */
export function unsubscribeUrl(siteUrl, email, now = Date.now()) {
  const token = createToken(TokenPurpose.UNSUBSCRIBE, email, NO_EXPIRY, now);
  return `${siteUrl}/newsletter/unsubscribe?token=${encodeURIComponent(token)}`;
}

/**
 * The link that reinstates an address which previously unsubscribed.
 *
 * Its purpose is signed and distinct from UNSUBSCRIBE, which is what stops an
 * unsubscribe link already in someone's inbox from being replayed to put them
 * back on the list — the exact reversal this whole flow exists to prevent.
 */
export function resubscribeUrl(siteUrl, email, now = Date.now()) {
  const token = createToken(
    TokenPurpose.RESUBSCRIBE,
    email,
    RESUBSCRIBE_TTL_SECONDS,
    now
  );
  return `${siteUrl}/newsletter/resubscribe?token=${encodeURIComponent(token)}`;
}
