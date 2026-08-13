import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { isNewsletterDbConfigured, newsletterDb } from "@/lib/newsletterDb";
import { TokenPurpose, verifyToken } from "@/lib/newsletterToken";

// The POST half of one-click unsubscribe.
//
// Every announcement carries a List-Unsubscribe-Post header, which tells Gmail
// and Outlook to POST here directly rather than opening the link in a browser.
// Declaring that header without handling the POST is worse than omitting it:
// the client shows its native unsubscribe button and the click does nothing,
// so the subscriber concludes the button is broken and reaches for the spam
// report instead — the exact outcome the header exists to prevent.
//
// The human-visible page at /newsletter/unsubscribe handles the GET. Both go
// through the same token verification and the same RPC.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  // The token arrives in the query string, because that is where the header's
  // URL put it. RFC 8058 has the client POST to the List-Unsubscribe URL
  // verbatim with a form body of "List-Unsubscribe=One-Click", so the body
  // carries no token and must not be relied on.
  const token = new URL(req.url).searchParams.get("token");

  const verified = verifyToken(token, TokenPurpose.UNSUBSCRIBE);

  if (!verified.ok) {
    // 400 rather than a redirect: this is a machine-to-machine call, and
    // nobody is watching a page.
    return NextResponse.json({ error: "Invalid link." }, { status: 400 });
  }

  // A 5xx rather than a silent success, for the same reason as the RPC failure
  // below: a mail client told "done" by a misconfigured deploy stops offering
  // the button, and the reader's next move is the spam report.
  if (!isNewsletterDbConfigured()) {
    return NextResponse.json({ error: "Could not unsubscribe." }, { status: 503 });
  }

  try {
    const { error } = await newsletterDb().rpc("unsubscribe_newsletter", {
      p_email: verified.email,
    });

    if (error) {
      Sentry.captureException(error);
      // A 5xx tells the mail client to retry, which is what we want: a failed
      // unsubscribe that reports success is an address that keeps receiving
      // mail it asked to stop.
      return NextResponse.json({ error: "Could not unsubscribe." }, { status: 503 });
    }
  } catch (error) {
    Sentry.captureException(error);
    return NextResponse.json({ error: "Could not unsubscribe." }, { status: 503 });
  }

  // 200 with no body. The RPC is idempotent, so a client that fires this more
  // than once — which they do — gets the same answer every time.
  return new NextResponse(null, { status: 200, headers: { "Cache-Control": "no-store" } });
}
