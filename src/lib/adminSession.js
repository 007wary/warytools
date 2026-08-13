// The admin dashboard's session cookie.
//
// The dashboard's one button emails the entire subscriber list, so the login
// is a real security boundary rather than a convenience. Three decisions
// follow from that, and each is load-bearing:
//
//   - The password is checked ONCE, server-side, and exchanged for a signed
//     session cookie. The password itself is never stored in the browser and
//     never travels in a URL. A `?key=SECRET` scheme would put it in browser
//     history, server access logs, and any Referer header the page leaks.
//   - The cookie is httpOnly, so script on the page cannot read it. That is
//     what stops an XSS anywhere on wary.tools from being escalated into "mail
//     the whole list" — localStorage would hand the session straight over.
//   - The cookie is a signed payload, not a random opaque token. There is no
//     session table, so nothing to look up and nothing to clean up; the
//     signature IS the proof, exactly as it is for the unsubscribe links.
//
// The signed payload is `issuedAt.expiry`, with no identity in it — there is
// one operator, so a session says only "someone proved they know the
// password, at this time".

import { createHmac, timingSafeEqual } from "crypto";

export const SESSION_COOKIE = "wt_admin";

// Twelve hours. Long enough that publishing a post and sending it days apart
// does not mean two logins in one sitting; short enough that a session left
// open on a borrowed machine expires the same day.
export const SESSION_TTL_SECONDS = 12 * 60 * 60;

/**
 * The signing secret for session cookies.
 *
 * Deliberately the token secret, reused. A separate variable would be a third
 * secret to set for no gain: both sign short-lived proofs, neither is ever
 * shown to a user, and rotating either invalidates only sessions and links
 * that were about to expire anyway.
 *
 * Read at call time rather than module scope so a missing value fails at the
 * point of use — these modules are imported during a static build, where
 * throwing on an unset env var would break `npm run build` for anyone without
 * the secret.
 */
function signingSecret() {
  const secret = process.env.NEWSLETTER_TOKEN_SECRET;
  if (!secret) throw new Error("NEWSLETTER_TOKEN_SECRET is not set");
  return secret;
}

function sign(payload) {
  return createHmac("sha256", signingSecret()).update(`admin.${payload}`).digest("base64url");
}

/**
 * Constant-time string comparison.
 *
 * Used for both the password and the cookie signature. A `===` on a secret
 * returns as soon as two bytes differ, which leaks how much of a guess was
 * correct — over enough attempts that is how a secret gets recovered one
 * character at a time.
 *
 * Length is compared first because timingSafeEqual throws on a mismatch. That
 * comparison does leak the length of the expected value, which is why this is
 * paired with a rate limit rather than relied on alone.
 */
export function secretMatches(given, expected) {
  if (typeof given !== "string" || typeof expected !== "string") return false;
  if (given.length === 0 || expected.length === 0) return false;

  const a = Buffer.from(given);
  const b = Buffer.from(expected);

  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Mints a session cookie value.
 *
 * @param {number} [now] Epoch ms, injectable for tests.
 * @returns {string}
 */
export function createSession(now = Date.now()) {
  const issuedAt = Math.floor(now / 1000);
  const expiry = issuedAt + SESSION_TTL_SECONDS;
  const payload = `${issuedAt}.${expiry}`;

  return `${payload}.${sign(payload)}`;
}

/**
 * Verifies a session cookie value.
 *
 * @param {unknown} value
 * @param {number} [now] Epoch ms, injectable for tests.
 * @returns {boolean}
 */
export function verifySession(value, now = Date.now()) {
  if (typeof value !== "string" || value === "") return false;

  const parts = value.split(".");
  if (parts.length !== 3) return false;

  const [issuedAt, expiry, signature] = parts;
  const payload = `${issuedAt}.${expiry}`;

  // Signature first, before the expiry is read or trusted. Everything after
  // this point treats the payload as our own data; checking any of it first
  // would mean acting on attacker-controlled input ahead of establishing that
  // we wrote it.
  let expected;
  try {
    expected = sign(payload);
  } catch {
    // Secret unset. Refuse rather than accept — a dashboard that locks its
    // operator out when misconfigured is a bug; one that admits everyone when
    // misconfigured is a breach.
    return false;
  }

  if (!secretMatches(signature, expected)) return false;

  const expiresAt = Number(expiry);
  if (!Number.isFinite(expiresAt)) return false;

  return Math.floor(now / 1000) <= expiresAt;
}

/**
 * The Set-Cookie attributes for a session.
 *
 * httpOnly: script cannot read it, so an XSS cannot steal the session.
 * secure: never sent over plain HTTP.
 * sameSite=strict: the cookie is not attached to cross-site requests at all,
 *   which is what makes CSRF against the send endpoint impossible — a form on
 *   another origin cannot borrow this session. Strict rather than lax because
 *   nothing here is ever legitimately reached by a link from elsewhere.
 * path=/: the cookie must reach both the dashboard page and /api/admin/*,
 *   which sit on different paths.
 */
export function sessionCookieOptions(maxAge = SESSION_TTL_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge,
  };
}
