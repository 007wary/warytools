import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { SITE_URL } from "@/lib/siteUrl";
import {
  checkSubmission,
  rejectionMessage,
  notificationSubject,
  escapeHtml,
} from "@/lib/contactValidation";

// Sends a contact-form submission to our inbox via Resend.
//
// This route is a real security boundary, unlike /api/shorten (where the
// database is). RESEND_API_KEY is server-only and deliberately not
// NEXT_PUBLIC_ — a mail-sending key in the browser bundle would let anyone
// send mail as us — so there is no path to the send except through this code.
// Every check below is therefore the one that counts; the client's copy of the
// same checks is a courtesy that produces faster feedback.
//
// It replaces the mailto: link that used to sit on /contact. That link exposed
// a personal address to every scraper that reads the page, and it only worked
// for visitors with a configured desktop mail client — on a phone browser or
// webmail it did nothing at all.

export const runtime = "nodejs";
// Never cache a submission endpoint.
export const dynamic = "force-dynamic";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
// Sends as hello@wary.tools, which requires wary.tools to be verified in
// Resend (SPF + DKIM on a `send.` subdomain). The env var is still the source
// of truth so the address can change without a deploy; this default just means
// a correctly-verified deploy needs one less variable set.
//
// Note this address only *sends*. wary.tools has no MX records, so mail to
// hello@ is not delivered anywhere — which is fine and deliberate, because
// every reply goes to the visitor's own address via Reply-To below, never
// here. Adding an inbox later means adding MX records, not changing this.
const CONTACT_FROM = process.env.CONTACT_FROM_EMAIL || "WaryTools <hello@wary.tools>";
// The inbox that actually receives submissions — a personal address, so it is
// deliberately not hardcoded here. It appears in no bundle and no header the
// sender can see; they only ever see hello@wary.tools.
const CONTACT_TO = process.env.CONTACT_TO_EMAIL;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false } }
);

const SITE_ORIGIN = new URL(SITE_URL).origin;

// Same construction as /api/shorten and /api/pdf-to-word: a salted hash, not
// the IP. The limiter needs to tell callers apart, not know who they are, and a
// raw IP stored next to "this person sent us a message" is personal data we
// have no reason to keep.
function rateLimitBucket(req) {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded
    ? forwarded.split(",")[0].trim()
    : req.headers.get("x-real-ip") || "unknown";

  return createHash("sha256").update(`${SITE_ORIGIN}:contact:${ip}`).digest("hex").slice(0, 32);
}

function fail(message, status, headers = {}) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store", ...headers } }
  );
}

const UNAVAILABLE =
  "The contact form is temporarily unavailable. Please try again in a few minutes.";

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return fail("Invalid request body.", 400);
  }

  // Validation runs before the mailer-availability check, for the same reason
  // it does in the PDF route: the other order means a malformed request takes a
  // different path depending on whether the mailer happens to be configured, so
  // the validation would be untested in exactly the environment where it
  // matters — and a bad submission would be reported as our outage rather than
  // as something the sender can fix.
  const result = checkSubmission(body);
  if (!result.ok) {
    return fail(rejectionMessage(result.reason), 400);
  }

  const { name, email, message } = result.value;

  // A missing deploy degrades rather than breaking: with these unset the form
  // says it's unavailable instead of throwing, so dev and previews work without
  // a Resend account. Checked after validation but before the quota spend, so
  // an outage doesn't burn quota nobody got a message out of.
  if (!RESEND_API_KEY || !CONTACT_TO) {
    return fail(UNAVAILABLE, 503);
  }

  // Quota is consumed before the send, so a caller who is over budget costs us
  // a single Postgres round-trip instead of an email.
  try {
    const { data: allowed, error } = await supabase.rpc("consume_contact_quota", {
      p_bucket: rateLimitBucket(req),
    });

    if (error) {
      // Fail closed, matching the PDF route. An unreachable limiter can't tell
      // an ordinary user from someone hammering the endpoint, and what's being
      // protected here is a metered mail quota and a human's inbox.
      Sentry.captureException(error);
      return fail(UNAVAILABLE, 503);
    }

    if (allowed === false) {
      return fail(
        "You've sent a few messages already. Please wait a while before sending another.",
        429,
        { "Retry-After": "3600" }
      );
    }
  } catch (error) {
    Sentry.captureException(error);
    return fail(UNAVAILABLE, 503);
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: CONTACT_FROM,
        to: [CONTACT_TO],
        // The sender's own address goes in Reply-To, never in From: sending
        // mail claiming to be from an address on a domain we don't control is
        // what SPF and DMARC exist to reject, and it would land us in spam.
        // Reply-To means hitting reply in the inbox still answers the sender.
        reply_to: `${name} <${email}>`,
        subject: notificationSubject(name),
        // Both parts are escaped: this is user-authored text rendered by a mail
        // client, and a form that pipes attacker HTML into the operator's inbox
        // is a phishing delivery mechanism pointed at us.
        html: renderHtml({ name, email, message }),
        text: renderText({ name, email, message }),
      }),
    });

    if (!response.ok) {
      // Resend's error body names the cause (unverified domain, bad key), which
      // we want in Sentry but never in the response — it describes our
      // configuration, not anything the sender did wrong.
      let detail = `status ${response.status}`;
      try {
        const errorBody = await response.json();
        detail = errorBody?.message || errorBody?.name || detail;
      } catch {
        // Non-JSON error page; the status is all we have.
      }

      Sentry.captureMessage(`Resend rejected a contact message: ${detail}`, "error");
      return fail(UNAVAILABLE, 502);
    }

    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    Sentry.captureException(error);
    return fail(UNAVAILABLE, 502);
  }
}

function renderText({ name, email, message }) {
  return [
    `From: ${name} <${email}>`,
    "",
    message,
    "",
    "—",
    `Sent from the contact form at ${SITE_ORIGIN}/contact`,
  ].join("\n");
}

function renderHtml({ name, email, message }) {
  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  // Newlines are meaningful in what someone typed into a textarea, and HTML
  // collapses them — so they're converted to <br> after escaping, never before.
  const safeMessage = escapeHtml(message).replace(/\n/g, "<br>");

  return `<div style="font-family:system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.6;color:#111">
  <p style="margin:0 0 4px"><strong>${safeName}</strong></p>
  <p style="margin:0 0 16px;color:#555">${safeEmail}</p>
  <div style="padding:16px;border-left:3px solid #ddd;background:#fafafa">${safeMessage}</div>
  <p style="margin:16px 0 0;font-size:12px;color:#888">Sent from the contact form at ${SITE_ORIGIN}/contact</p>
</div>`;
}
