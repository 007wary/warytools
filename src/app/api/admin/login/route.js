import { createHash } from "crypto";
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { SITE_URL } from "@/lib/siteUrl";
import { isNewsletterDbConfigured, newsletterDb } from "@/lib/newsletterDb";
import {
  SESSION_COOKIE,
  createSession,
  secretMatches,
  sessionCookieOptions,
} from "@/lib/adminSession";

// Exchanges the admin password for a session cookie.
//
// The password is checked here and nowhere else, and it never leaves the
// server: the browser gets an httpOnly signed cookie back, so script on the
// page cannot read the session and the password itself is never stored client
// side or placed in a URL.
//
// NEWSLETTER_ADMIN_PASSWORD is deliberately a DIFFERENT secret from
// NEWSLETTER_ADMIN_SECRET. The latter authorises a send over the API and is
// pasted into curl commands and shell history; this one is typed into a login
// box. Keeping them separate means the operator can pick something memorable
// for the dashboard without weakening the API credential, and rotating either
// does not disturb the other.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_PASSWORD = process.env.NEWSLETTER_ADMIN_PASSWORD;

const SITE_ORIGIN = new URL(SITE_URL).origin;

// A salted hash, not the IP — the same construction as every other limiter
// here. The limiter needs to tell callers apart, not know who they are.
function rateLimitBucket(req) {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded
    ? forwarded.split(",")[0].trim()
    : req.headers.get("x-real-ip") || "unknown";

  return createHash("sha256")
    .update(`${SITE_ORIGIN}:admin-login:${ip}`)
    .digest("hex")
    .slice(0, 32);
}

function fail(message, status) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(req) {
  if (
    !ADMIN_PASSWORD ||
    !process.env.NEWSLETTER_TOKEN_SECRET ||
    !isNewsletterDbConfigured()
  ) {
    // Unconfigured rather than unauthorised: with no password set there is no
    // correct request, and a 401 would imply one exists. The database is part
    // of that check because the limiter below fails closed — without it there
    // is no safe way to accept a login attempt at all.
    return fail("The dashboard is not configured.", 503);
  }

  const supabase = newsletterDb();

  let body;
  try {
    body = await req.json();
  } catch {
    return fail("Invalid request body.", 400);
  }

  // The limit is consumed BEFORE the password is checked, so a wrong guess and
  // a right one cost the same. Consuming only on failure would let an attacker
  // run unlimited attempts as long as none succeeded — which is exactly the
  // situation being defended against.
  //
  // consume_admin_login_quota is no longer executable by `anon` either (see
  // newsletterDb.js). The bucket is a hash of the caller's IP, so a public RPC
  // did not let anyone bypass their OWN limit — it let them spend anyone
  // else's. The salt is a fixed string in this file, so the bucket for a given
  // IP is computable by anyone who reads the client bundle's Supabase URL and
  // guesses the construction, and ten direct calls would then lock the
  // operator out of their own dashboard for fifteen minutes, repeatable
  // indefinitely. A rate limiter that a stranger can spend on your behalf is a
  // denial-of-service primitive rather than a defence.
  try {
    const { data: allowed, error } = await supabase.rpc("consume_admin_login_quota", {
      p_bucket: rateLimitBucket(req),
    });

    if (error) {
      // Fail closed. An unreachable limiter cannot tell one fat-fingered login
      // from a dictionary run, and what is behind this door is the ability to
      // email every subscriber.
      Sentry.captureException(error);
      return fail("Could not verify the login. Please try again shortly.", 503);
    }

    if (allowed === false) {
      return fail("Too many attempts. Wait fifteen minutes and try again.", 429);
    }
  } catch (error) {
    Sentry.captureException(error);
    return fail("Could not verify the login. Please try again shortly.", 503);
  }

  if (!secretMatches(body?.password, ADMIN_PASSWORD)) {
    // Deliberately vague and identical for every wrong input: no hint about
    // length, no "close but wrong", nothing that narrows a guess.
    return fail("Incorrect password.", 401);
  }

  const response = NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } }
  );

  response.cookies.set(SESSION_COOKIE, createSession(), sessionCookieOptions());

  return response;
}

// Logging out clears the cookie. A GET would let any page log the operator out
// by embedding an image, which is harmless but confusing, so it is a POST.
export async function DELETE() {
  const response = NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } }
  );

  // maxAge 0 expires it immediately. The value is emptied as well, so a client
  // that ignores the expiry still holds nothing usable.
  response.cookies.set(SESSION_COOKIE, "", sessionCookieOptions(0));

  return response;
}
