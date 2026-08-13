import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { SITE_URL } from "@/lib/siteUrl";
import { checkSubscription, rejectionMessage } from "@/lib/newsletterValidation";
import { resubscribeUrl, unsubscribeUrl } from "@/lib/newsletterToken";
import {
  renderResubscribeEmailHtml,
  renderResubscribeEmailText,
  renderWelcomeEmailHtml,
  renderWelcomeEmailText,
} from "@/lib/newsletterEmailTemplate";
import { listUnsubscribeHeaders, sendEmail } from "@/lib/newsletterMailer";

// Subscribes an address immediately and sends a welcome email.
//
// SINGLE opt-in, by an explicit product decision: the subscription is live the
// moment the form is submitted, and the welcome email reports that rather than
// gating it. An earlier version required a confirmation click. What that
// bought was protection against someone entering a stranger's address; what it
// cost was every real reader having to find an email and click before they
// were subscribed at all.
//
// Losing the confirm step means the remaining defences carry more weight than
// they used to, so none of them may be quietly dropped:
//
//   1. A per-IP quota (consume_newsletter_quota) bounds one SENDER.
//   2. A per-address cooldown inside subscribe_newsletter_directly bounds one
//      VICTIM — without it, a stranger's address submitted repeatedly earns
//      them a welcome email every time, and the public form becomes a
//      mail-bomb aimed at whoever the attacker names.
//   3. The welcome email leads with an unsubscribe link, because under single
//      opt-in the recipient is not guaranteed to be the person who typed the
//      address, and leaving must be the easiest thing in it.
//
// The response is deliberately identical whether the address was new, already
// subscribed, or suppressed by the cooldown. A form that distinguishes them is
// an oracle for testing whether a given person is on the list, which is
// precisely the fact a subscriber list must not leak.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
// Same sender as the contact form, which requires wary.tools to be verified in
// Resend. Newsletter mail is bulk rather than transactional, so it could
// arguably warrant its own subdomain and reputation — worth revisiting if
// volume grows, but splitting it now would mean a second domain verification
// for a list of zero.
const NEWSLETTER_FROM =
  process.env.NEWSLETTER_FROM_EMAIL || "WaryTools <hello@wary.tools>";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false } }
);

const SITE_ORIGIN = new URL(SITE_URL).origin;

// A salted hash, not the IP — the same construction as /api/contact and
// /api/shorten. The limiter needs to tell callers apart, not know who they are.
function rateLimitBucket(req) {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded
    ? forwarded.split(",")[0].trim()
    : req.headers.get("x-real-ip") || "unknown";

  return createHash("sha256")
    .update(`${SITE_ORIGIN}:newsletter:${ip}`)
    .digest("hex")
    .slice(0, 32);
}

function fail(message, status, headers = {}) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store", ...headers } }
  );
}

const UNAVAILABLE =
  "Subscriptions are temporarily unavailable. Please try again in a few minutes.";

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return fail("Invalid request body.", 400);
  }

  // Validation runs before the mailer-availability check, for the same reason
  // it does in the contact and PDF routes: the other order means a malformed
  // request takes a different path depending on whether the mailer happens to
  // be configured, so the validation would be untested in exactly the
  // environment where it matters.
  const result = checkSubscription(body);
  if (!result.ok) {
    return fail(rejectionMessage(result.reason), 400);
  }

  const { email } = result.value;

  // A missing deploy degrades rather than breaking, so dev and previews work
  // without a Resend account or a token secret. Checked after validation but
  // before the quota spend, so an outage doesn't burn quota nobody got an
  // email out of.
  if (!RESEND_API_KEY || !process.env.NEWSLETTER_TOKEN_SECRET) {
    return fail(UNAVAILABLE, 503);
  }

  try {
    const { data: allowed, error } = await supabase.rpc("consume_newsletter_quota", {
      p_bucket: rateLimitBucket(req),
    });

    if (error) {
      // Fail closed, matching every other limiter here. An unreachable limiter
      // can't tell an ordinary visitor from someone hammering the endpoint,
      // and what's being protected is a metered mail quota and strangers'
      // inboxes.
      Sentry.captureException(error);
      return fail(UNAVAILABLE, 503);
    }

    if (allowed === false) {
      return fail(
        "That's a few sign-ups from here already. Please wait a little and try again.",
        429,
        { "Retry-After": "3600" }
      );
    }
  } catch (error) {
    Sentry.captureException(error);
    return fail(UNAVAILABLE, 503);
  }

  // Returns one of three outcomes rather than a boolean — see the RPC's own
  // comment. "confirm" is the opted-out case, where the subscription is
  // deliberately NOT reinstated by a form submission alone.
  let outcome;
  try {
    const { data, error } = await supabase.rpc("subscribe_newsletter_directly", {
      p_email: email,
    });

    if (error) {
      Sentry.captureException(error);
      return fail(UNAVAILABLE, 503);
    }

    outcome = data;
  } catch (error) {
    Sentry.captureException(error);
    return fail(UNAVAILABLE, 503);
  }

  // Already subscribed and emailed recently. They ARE subscribed either way —
  // only the email is suppressed — so this is the same response as a send.
  if (outcome !== "welcome" && outcome !== "confirm") {
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  }

  const unsubscribe = unsubscribeUrl(SITE_URL, email);

  // The opted-out path. This address chose to leave, and an anonymous form
  // submission must not undo that — otherwise anyone could put someone back on
  // a list they deliberately left. So a link that proves control of the inbox
  // is required, and only clicking it reinstates the subscription.
  const isReinstate = outcome === "confirm";
  const reinstate = isReinstate ? resubscribeUrl(SITE_URL, email) : null;

  const sent = await sendEmail({
    apiKey: RESEND_API_KEY,
    from: NEWSLETTER_FROM,
    to: email,
    subject: isReinstate
      ? "Resubscribe to WaryTools?"
      : "You're subscribed to WaryTools",
    html: isReinstate
      ? renderResubscribeEmailHtml({ resubscribeUrl: reinstate, siteUrl: SITE_URL })
      : renderWelcomeEmailHtml({ unsubscribeUrl: unsubscribe, siteUrl: SITE_URL }),
    text: isReinstate
      ? renderResubscribeEmailText({ resubscribeUrl: reinstate, siteUrl: SITE_URL })
      : renderWelcomeEmailText({ unsubscribeUrl: unsubscribe, siteUrl: SITE_URL }),
    // The welcome announces a live subscription, so it carries List-Unsubscribe
    // and owes the recipient a one-click exit from the very first message.
    // The reinstate email deliberately does not: that address is already
    // unsubscribed, and offering to remove them again is a confusing no-op.
    ...(isReinstate ? {} : { headers: listUnsubscribeHeaders(unsubscribe) }),
  });

  if (!sent.ok) {
    // The subscription itself already succeeded, so this is logged but not
    // reported as a failure to the visitor: they are on the list, and telling
    // them otherwise would invite a resubmit that changes nothing.
    Sentry.captureMessage(
      `Resend rejected a newsletter ${isReinstate ? "reinstate" : "welcome"}: ${sent.detail}`,
      "error"
    );
  }

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
