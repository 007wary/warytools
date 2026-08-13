import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { SITE_URL } from "@/lib/siteUrl";
import { checkSubscription, rejectionMessage } from "@/lib/newsletterValidation";
import { confirmUrl } from "@/lib/newsletterToken";
import {
  renderConfirmEmailHtml,
  renderConfirmEmailText,
} from "@/lib/newsletterEmailTemplate";
import { sendEmail } from "@/lib/newsletterMailer";

// Takes a subscription request and sends the confirmation email.
//
// This is the only newsletter route reachable from a public form, so it is
// where the abuse pressure lands. Three separate defences, each covering a
// case the others miss:
//
//   1. A per-IP quota (consume_newsletter_quota) bounds one SENDER.
//   2. A per-address cap and cooldown inside request_newsletter_subscription
//      bounds one VICTIM — without it, a stranger's address submitted from
//      many IPs gets a confirmation email each time, and a public form becomes
//      a mail-bomb aimed at whoever the attacker names.
//   3. Double opt-in means an address that never confirms receives exactly one
//      email, ever, no matter what.
//
// The response is deliberately identical whether the address was new, already
// subscribed, already confirmed, or suppressed by the cooldown. A form that
// distinguishes them is an oracle for testing whether a given person is on the
// list, which is precisely the fact a subscriber list must not leak.

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

// The one success message, used for every non-error outcome. Worded to be true
// in all of them: a new address gets a confirmation, an already-confirmed one
// gets nothing, and both are honestly described by "check your inbox to
// confirm" — the second person simply has nothing to find, which tells an
// attacker nothing.
const SUCCESS =
  "Almost there — check your inbox for a confirmation link. It expires in three days.";

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

  // Records the request and decides whether an email is warranted. Returns a
  // bare boolean by design — see the function's own comment; anything richer
  // would leak whether the address was already on the list.
  let shouldSend;
  try {
    const { data, error } = await supabase.rpc("request_newsletter_subscription", {
      p_email: email,
    });

    if (error) {
      Sentry.captureException(error);
      return fail(UNAVAILABLE, 503);
    }

    shouldSend = data === true;
  } catch (error) {
    Sentry.captureException(error);
    return fail(UNAVAILABLE, 503);
  }

  // Already confirmed, or capped, or inside the cooldown. Same response as a
  // successful send.
  if (!shouldSend) {
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  }

  const sent = await sendEmail({
    apiKey: RESEND_API_KEY,
    from: NEWSLETTER_FROM,
    to: email,
    subject: "Confirm your WaryTools subscription",
    html: renderConfirmEmailHtml({ confirmUrl: confirmUrl(SITE_URL, email), siteUrl: SITE_URL }),
    text: renderConfirmEmailText({ confirmUrl: confirmUrl(SITE_URL, email), siteUrl: SITE_URL }),
    // Deliberately NO List-Unsubscribe header. This is a transactional
    // confirmation, not bulk mail: there is nothing to unsubscribe from until
    // it is acted on, and offering to remove an address that isn't subscribed
    // is a confusing no-op.
  });

  if (!sent.ok) {
    Sentry.captureMessage(
      `Resend rejected a newsletter confirmation: ${sent.detail}`,
      "error"
    );
    return fail(UNAVAILABLE, 502);
  }

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
