import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { SITE_URL } from "@/lib/siteUrl";
import { checkUrl, rejectionMessage } from "@/lib/urlShortenerValidation";
import { generateCode } from "@/lib/shortCode";

// This route is a convenience wrapper, not the security boundary. The
// database is: `create_short_url` is a SECURITY DEFINER function and anon
// has no direct INSERT on short_urls, so the validation and rate limiting
// below can't be skipped by calling PostgREST directly with the (public)
// anon key. What this route adds is a better error message and a second
// check close to the user.
export const runtime = "nodejs";
// Never cache a creation endpoint.
export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false } }
);

const SITE_ORIGIN = new URL(SITE_URL).origin;

// The rate-limit bucket is a salted hash of the client IP, not the IP
// itself — the limiter needs to tell callers apart, not know who they are,
// and a raw IP sitting in a database row is personal data we have no
// reason to keep. The site URL is a stable, deployment-specific salt.
function rateLimitBucket(req) {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded
    ? forwarded.split(",")[0].trim()
    : req.headers.get("x-real-ip") || "unknown";

  return createHash("sha256").update(`${SITE_ORIGIN}:${ip}`).digest("hex").slice(0, 32);
}

const MAX_ATTEMPTS = 5;

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const result = checkUrl(body?.url, SITE_ORIGIN);
  if (!result.ok) {
    return NextResponse.json({ error: rejectionMessage(result.reason) }, { status: 400 });
  }

  const bucket = rateLimitBucket(req);

  // Retry on collision. With a 57^7 keyspace a collision is vanishingly
  // unlikely, but "unlikely" isn't "impossible" and the unique index makes
  // the failure explicit rather than silently overwriting someone's link.
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const shortCode = generateCode();

    const { data, error } = await supabase.rpc("create_short_url", {
      p_short_code: shortCode,
      p_long_url: result.url,
      p_bucket: bucket,
    });

    if (!error) {
      const row = Array.isArray(data) ? data[0] : data;
      return NextResponse.json(
        { shortCode: row.short_code, longUrl: row.long_url, createdAt: row.created_at },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    // Raised by the function itself once the per-window quota is spent.
    if (error.message?.includes("rate limit exceeded")) {
      return NextResponse.json(
        { error: "Too many links created. Please wait a minute and try again." },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }

    // 23505 = unique_violation on short_code; retry with a new code.
    // Anything else is a real failure and shouldn't burn the remaining
    // attempts.
    if (error.code !== "23505") {
      // The database rejecting the URL means our own validation and the
      // function's disagree — worth knowing about, but the user just sees
      // the same message they'd have got from the check above.
      if (error.code === "23514") {
        return NextResponse.json(
          { error: "That URL can't be shortened." },
          { status: 400 }
        );
      }

      Sentry.captureException(error);
      return NextResponse.json(
        { error: "Could not create short link. Please try again." },
        { status: 500 }
      );
    }
  }

  Sentry.captureMessage("Exhausted short-code retry attempts", "error");
  return NextResponse.json(
    { error: "Could not create short link. Please try again." },
    { status: 500 }
  );
}
