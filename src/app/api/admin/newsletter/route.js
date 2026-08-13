import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { getAllPosts } from "@/lib/blogPosts";
import { SESSION_COOKIE, verifySession } from "@/lib/adminSession";
import { resolveDailyCap } from "@/lib/newsletterSendQuota";

// The dashboard's read model: every published post with its sent state, plus
// the numbers needed to judge whether a send is safe to start.
//
// Read-only by design. Sending still goes through /api/newsletter/send with
// its bearer secret — this route never triggers one. That split matters: a
// session cookie is a weaker credential than a secret typed per action (it
// persists, and it rides along on same-site requests), so it grants looking
// but not the one irreversible action on the site.
//
// It deliberately returns NO subscriber addresses, only a count. The list is
// unreadable from a browser by design (see the newsletter notes in CLAUDE.md),
// and a dashboard is not a reason to undo that — a leaked session would
// otherwise become a leaked mailing list.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function unauthorized() {
  return NextResponse.json(
    { error: "Not signed in." },
    { status: 401, headers: { "Cache-Control": "no-store" } }
  );
}

export async function GET(req) {
  if (!verifySession(req.cookies.get(SESSION_COOKIE)?.value)) {
    return unauthorized();
  }

  if (!SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "The newsletter is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  try {
    // `head: true` with an exact count returns the number without the rows —
    // so no address crosses the network even inside the server.
    const [{ count: subscribers }, sentResult, ledgerResult] = await Promise.all([
      supabase
        .from("newsletter_subscribers")
        .select("*", { count: "exact", head: true })
        .not("confirmed_at", "is", null)
        .is("unsubscribed_at", null),
      supabase.from("newsletter_sent_posts").select("slug, sent_at, recipient_count"),
      supabase
        .from("newsletter_send_ledger")
        .select("emails_sent")
        // The ledger keys on Postgres `current_date`, which is UTC. Building
        // the key from a local date would miss the row once the server's
        // timezone has rolled over but UTC has not.
        .eq("day", new Date().toISOString().slice(0, 10))
        .maybeSingle(),
    ]);

    if (sentResult.error) throw sentResult.error;

    const sentBySlug = new Map(
      (sentResult.data || []).map((row) => [row.slug, row])
    );

    // getAllPosts() excludes drafts in a production build, so the dashboard
    // lists exactly what a visitor can read — and a draft can never be
    // offered for sending by accident.
    const posts = getAllPosts().map((post) => {
      const sent = sentBySlug.get(post.slug) || null;

      return {
        slug: post.slug,
        title: post.title,
        date: post.date,
        category: post.category ?? null,
        sent: Boolean(sent),
        sentAt: sent?.sent_at ?? null,
        sentTo: sent?.recipient_count ?? null,
      };
    });

    const dailyCap = resolveDailyCap();
    const sentToday = ledgerResult.data?.emails_sent ?? 0;

    return NextResponse.json(
      {
        ok: true,
        subscribers: subscribers ?? 0,
        dailyCap,
        sentToday,
        remainingToday: Math.max(0, dailyCap - sentToday),
        posts,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    Sentry.captureException(error);
    return NextResponse.json(
      { error: "Could not load the newsletter status." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
