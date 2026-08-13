// The daily sending cap, and the arithmetic for deciding whether a run fits.
//
// Resend's free tier allows 100 emails per day. Exceeding it does not fail
// loudly: a run gets partway through the list, later recipients are rejected,
// and the post is ALREADY marked sent (the slug is claimed before the first
// email, deliberately — see the send route), so those people can never receive
// it. The subscribers who miss out are always whoever sorts last, and the only
// trace is a `failed` array in a response nobody reads.
//
// So a run that cannot finish is refused before it starts. Refusing outright
// beats sending to as many as fit: "raise the cap or split the send" is
// actionable, whereas a half-delivered blast is unrecoverable and invisible.
//
// The cap is configurable because the plan is: someone on a paid tier should
// not have to edit code to use what they pay for.

// Resend's documented free-tier daily limit. Deliberately a conservative
// default rather than something larger — being wrong in this direction costs
// a refused send, being wrong the other way costs silently undelivered mail.
export const DEFAULT_DAILY_SEND_CAP = 100;

/**
 * Resolves the configured cap.
 *
 * Read from the environment at call time rather than module scope so a test
 * can set it, and so a deploy can raise it without a code change. A malformed
 * or non-positive value falls back to the default rather than disabling the
 * guard: an unparseable env var must not silently remove the protection, which
 * is what `Number(value) || 0` would have done.
 *
 * @param {string|undefined} raw
 * @returns {number}
 */
export function resolveDailyCap(raw = process.env.NEWSLETTER_DAILY_SEND_CAP) {
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return DEFAULT_DAILY_SEND_CAP;
  }

  const parsed = Number(String(raw).trim());

  // Number.isFinite, never !isNaN — the latter accepts Infinity, which would
  // read as "no limit" and defeat the whole guard. Fractions are rejected too:
  // a cap of 99.5 has no meaning in whole emails.
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_DAILY_SEND_CAP;
  }

  return parsed;
}

/**
 * The message shown when a run is refused.
 *
 * Written to be actionable rather than merely apologetic: it names the numbers
 * involved and the two ways out, because the person reading it is the operator
 * and they can fix it.
 */
export function overCapMessage({ recipients, cap, alreadySentToday }) {
  const remaining = Math.max(0, cap - alreadySentToday);

  return (
    `This send needs ${recipients} emails but only ${remaining} of today's ` +
    `${cap} remain (${alreadySentToday} already sent). Nothing was emailed and ` +
    `the post is NOT marked as sent. Raise NEWSLETTER_DAILY_SEND_CAP if your ` +
    `Resend plan allows more, or wait until tomorrow.`
  );
}
