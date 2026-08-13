import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/adminSession";
import { POST as sendNewsletter } from "@/app/api/newsletter/send/route";

// The dashboard's send button, proxied.
//
// This exists so the browser never holds NEWSLETTER_ADMIN_SECRET. The
// dashboard authenticates with its session cookie; this route checks that,
// then calls the real send handler with the bearer secret attached
// server-side. Putting the secret in the client bundle to let the page call
// /api/newsletter/send directly would publish it to every visitor.
//
// The underlying handler is imported and invoked rather than re-fetched over
// HTTP: a self-fetch inside a serverless function costs a second cold start
// and can deadlock on a single-instance runtime, and every guard that matters
// (slug claim, daily cap, draft refusal, empty-list refusal) lives in that
// handler either way. There is exactly one implementation of "send a
// newsletter", which is the point.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  if (!verifySession(req.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.json(
      { error: "Not signed in." },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  const secret = process.env.NEWSLETTER_ADMIN_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "The newsletter sender is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  // Only these two fields are forwarded. Rebuilding the payload rather than
  // passing the parsed body through means a future field added to the send
  // handler cannot be reached from the dashboard until it is named here — the
  // session is a weaker credential than the bearer secret, so what it can
  // express is kept deliberately narrow.
  const forwarded = new Request(new URL(req.url), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      slug: typeof body?.slug === "string" ? body.slug : "",
      dryRun: body?.dryRun === true,
    }),
  });

  return sendNewsletter(forwarded);
}
