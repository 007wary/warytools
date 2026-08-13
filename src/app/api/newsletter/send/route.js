import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { SITE_URL } from "@/lib/siteUrl";
// The same constant-time compare the dashboard login uses, rather than a
// second copy: a byte-by-byte `===` on a secret leaks how much of a guess was
// correct, and a guard written twice is a guard that can disagree with itself.
import { secretMatches } from "@/lib/adminSession";
import { newsletterDb } from "@/lib/newsletterDb";
import { getPostBySlug } from "@/lib/blogPosts";
import { unsubscribeUrl } from "@/lib/newsletterToken";
import {
  postSubject,
  renderPostEmailHtml,
  renderPostEmailText,
} from "@/lib/newsletterEmailTemplate";
import { listUnsubscribeHeaders, sendEmail } from "@/lib/newsletterMailer";
import { overCapMessage, resolveDailyCap } from "@/lib/newsletterSendQuota";

// Emails a published post to the confirmed list. Operator-only.
//
// This is the one route on the site that can email hundreds of people, so the
// design is built around the two ways that goes wrong: sending to the wrong
// people, and sending twice.
//
//   - WRONG PEOPLE. The recipient query filters on confirmed_at IS NOT NULL
//     AND unsubscribed_at IS NULL, in the database, not in JS. An unconfirmed
//     or departed address is structurally unreachable rather than skipped by
//     convention.
//   - TWICE. newsletter_sent_posts has the slug as its PRIMARY KEY, and this
//     route claims the slug BEFORE sending a single email. A second call --
//     an impatient double-click, a retried request, a curl run twice -- hits a
//     unique violation and is refused. Claiming after the send would leave a
//     window in which the whole list gets a duplicate.
//
// The claim-first ordering has a deliberate cost: if the process dies midway,
// the slug is marked sent and the remainder never goes out. That is the right
// side to fail on. A partial send is a nuisance that a person can notice and
// work around; a duplicate blast to the whole list is the thing subscribers
// unsubscribe and report spam over, and it cannot be taken back.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The send loop is paced at SEND_INTERVAL_MS per recipient to stay under
// Resend's rate limit, so its runtime scales with the list: a full 100-address
// day is ~55s of deliberate sleeping. Vercel's default function timeout is
// well below what that needs, and being killed here is the worst failure this
// route has — the slug is claimed BEFORE the first email (deliberately, as the
// duplicate-send guard), so a timeout marks the post sent with most of the
// list unmailed, and they can never receive it.
//
// 300s is the ceiling on Vercel's Pro plan and leaves headroom for the whole
// cap plus the queries either side. It is the same class of reasoning as the
// converter routes' maxDuration, but the failure mode is worse: those retry
// cleanly, this one cannot.
//
// This bounds the cap as much as the plan does. If NEWSLETTER_DAILY_SEND_CAP
// is ever raised far above 100, this loop stops fitting in any single
// invocation and the send needs to become resumable (a cursor in the ledger)
// rather than one long request. See newsletterSendQuota.js.
export const maxDuration = 300;

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const NEWSLETTER_FROM =
  process.env.NEWSLETTER_FROM_EMAIL || "WaryTools <hello@wary.tools>";
// Server-only, and a distinct secret from every other one here: it is the
// single credential that authorises mailing the entire list.
const ADMIN_SECRET = process.env.NEWSLETTER_ADMIN_SECRET;
// The service role bypasses RLS, which is the only way to read subscriber
// addresses at all — anon has no table privileges and no RPC that returns one.
// It must never appear in a NEXT_PUBLIC_ variable or reach a client component.
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Resend's default account limit is 2 requests/second. Sending faster gets
// requests rejected, and a rejected send in the middle of a run is a
// subscriber who silently never receives the post.
const SEND_INTERVAL_MS = 550;

function fail(message, status) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(req) {
  if (!ADMIN_SECRET || !SERVICE_ROLE_KEY || !RESEND_API_KEY) {
    // Unconfigured rather than unauthorised: with no secret set there is no
    // correct request, and reporting 401 would suggest one exists.
    return fail("The newsletter sender is not configured.", 503);
  }

  // Bearer token in a header, never a query parameter — query strings land in
  // access logs, browser history, and Referer headers.
  const authorization = req.headers.get("authorization") || "";
  const presented = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";

  if (!secretMatches(presented, ADMIN_SECRET)) {
    return fail("Unauthorized.", 401);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return fail("Invalid request body.", 400);
  }

  const slug = typeof body?.slug === "string" ? body.slug.trim() : "";
  if (!slug) return fail("Provide the post's slug.", 400);

  // The post is read from the built site's own content, not from the request.
  // The caller names which post to send; they cannot supply its contents, so
  // there is no path from this endpoint to arbitrary text in a bulk email.
  const post = getPostBySlug(slug);

  if (!post) {
    return fail(
      `No published post with the slug "${slug}". Check the filename in src/content/blog/ and that the post has deployed.`,
      404
    );
  }

  // A draft is excluded from a production build entirely, so getPostBySlug
  // returning one means this is a dev run. Emailing an unproofread draft to
  // the list is precisely the accident this whole design exists to prevent.
  if (post.draft) {
    return fail("That post is still a draft.", 400);
  }

  const supabase = newsletterDb();

  // A dry run resolves the post and counts the audience without claiming the
  // slug or sending anything. This is the step that makes the manual trigger
  // safe to use: it answers "what exactly is about to happen" before anything
  // irreversible.
  const dryRun = body?.dryRun === true;

  let recipients;
  try {
    const { data, error } = await supabase
      .from("newsletter_subscribers")
      .select("email")
      .not("confirmed_at", "is", null)
      .is("unsubscribed_at", null);

    if (error) throw error;
    recipients = (data || []).map((row) => row.email);
  } catch (error) {
    Sentry.captureException(error);
    return fail("Could not read the subscriber list.", 503);
  }

  const dailyCap = resolveDailyCap();

  if (dryRun) {
    return NextResponse.json(
      {
        ok: true,
        dryRun: true,
        slug: post.slug,
        subject: postSubject(post),
        recipients: recipients.length,
        // Named so the operator can see the send is blocked before they try
        // it for real, rather than discovering it at the point of no return.
        alreadySent: await hasBeenSent(supabase, post.slug),
        dailyCap,
        sentToday: await sentToday(supabase),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  // An empty list is not an error, but it must not claim the slug either —
  // otherwise the first post published before anyone subscribes is burned, and
  // can never be sent to the people who join afterwards.
  if (recipients.length === 0) {
    return fail(
      "There are no confirmed subscribers, so nothing was sent and the post is not marked as sent.",
      409
    );
  }

  // Reserve the day's capacity BEFORE claiming the slug, so a refused run
  // leaves the post fully re-sendable. The reverse order would mark a post
  // sent that nobody received — the same unrecoverable state this guard exists
  // to prevent, arrived at by a different route.
  //
  // Reserving is atomic in Postgres (see the RPC), so two concurrent sends
  // cannot both see the same headroom and both proceed.
  let reserved = 0;
  try {
    const { data, error } = await supabase.rpc("reserve_newsletter_send_capacity", {
      p_count: recipients.length,
      p_daily_cap: dailyCap,
    });

    if (error) throw error;
    reserved = data ?? 0;
  } catch (error) {
    Sentry.captureException(error);
    // Fail closed, like every other limiter here: an unreachable ledger cannot
    // tell a safe run from one that would blow the cap.
    return fail("Could not check today's sending quota, so nothing was emailed.", 503);
  }

  if (reserved === 0) {
    return fail(
      overCapMessage({
        recipients: recipients.length,
        cap: dailyCap,
        alreadySentToday: await sentToday(supabase),
      }),
      429
    );
  }

  // Claim the slug BEFORE sending. See the header comment: this is the
  // duplicate-send guard, and its ordering is the whole point.
  try {
    const { error } = await supabase
      .from("newsletter_sent_posts")
      .insert({ slug: post.slug, recipient_count: recipients.length });

    if (error) {
      // 23505 is unique_violation — the slug was already claimed.
      if (error.code === "23505") {
        // Hand back the capacity: no email went out, so the day's budget must
        // not be spent. Without this, a few accidental double-sends would
        // exhaust the quota for real sends nobody made.
        await releaseCapacity(supabase, reserved);
        return fail(
          `"${post.slug}" has already been sent. Nothing was emailed.`,
          409
        );
      }
      throw error;
    }
  } catch (error) {
    Sentry.captureException(error);
    await releaseCapacity(supabase, reserved);
    return fail("Could not record the send, so nothing was emailed.", 503);
  }

  const subject = postSubject(post);
  const failures = [];
  let sent = 0;

  for (const [index, email] of recipients.entries()) {
    // A per-recipient token, so the unsubscribe link in each email removes
    // that reader and only that reader.
    const unsubscribe = unsubscribeUrl(SITE_URL, email);

    const result = await sendEmail({
      apiKey: RESEND_API_KEY,
      from: NEWSLETTER_FROM,
      to: email,
      subject,
      html: renderPostEmailHtml({ post, siteUrl: SITE_URL, unsubscribeUrl: unsubscribe }),
      text: renderPostEmailText({ post, siteUrl: SITE_URL, unsubscribeUrl: unsubscribe }),
      // Bulk mail, so this is required rather than optional — see
      // listUnsubscribeHeaders for why.
      headers: listUnsubscribeHeaders(unsubscribe),
    });

    if (result.ok) {
      sent += 1;
    } else {
      // One bad address must not abort the run and leave the list half
      // emailed with no record of where it stopped. Collect and continue.
      failures.push({ email, detail: result.detail });
    }

    // Paced BETWEEN sends, not after the last one — the interval exists to
    // space out calls to Resend, so a trailing sleep is pure dead time held
    // against the function's timeout.
    if (index < recipients.length - 1) {
      await sleep(SEND_INTERVAL_MS);
    }
  }

  if (failures.length > 0) {
    Sentry.captureMessage(
      `Newsletter "${post.slug}": ${failures.length} of ${recipients.length} sends failed`,
      "error"
    );

    // Capacity was reserved for the whole list up front. Anything Resend
    // refused never consumed quota on their side, so hand it back rather than
    // charging the day for emails that do not exist.
    await releaseCapacity(supabase, failures.length);
  }

  return NextResponse.json(
    {
      ok: true,
      slug: post.slug,
      subject,
      recipients: recipients.length,
      sent,
      // Addresses are returned only to the authenticated operator, who can
      // already read the whole list through this same credential.
      failed: failures,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

async function hasBeenSent(supabase, slug) {
  const { data } = await supabase
    .from("newsletter_sent_posts")
    .select("slug")
    .eq("slug", slug)
    .maybeSingle();

  return Boolean(data);
}

/** How many emails today's ledger has already spent. */
async function sentToday(supabase) {
  const { data } = await supabase
    .from("newsletter_send_ledger")
    .select("emails_sent")
    // Postgres `current_date` is UTC here, and the ledger keys on it; building
    // the key from the server's local date would miss the row for anyone whose
    // timezone has already rolled over.
    .eq("day", new Date().toISOString().slice(0, 10))
    .maybeSingle();

  return data?.emails_sent ?? 0;
}

/**
 * Hands back reserved-but-unused capacity.
 *
 * Never throws: this runs on paths that are already returning an error, and a
 * failure to release must not mask the original problem. A leaked reservation
 * costs at most one day of headroom and self-corrects at midnight, which is a
 * far smaller failure than a 500 hiding why a send was refused.
 */
async function releaseCapacity(supabase, count) {
  if (!count || count <= 0) return;

  try {
    await supabase.rpc("release_newsletter_send_capacity", { p_count: count });
  } catch (error) {
    Sentry.captureException(error);
  }
}
