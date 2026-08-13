// The server-side Supabase client for the contact and converter rate limiters.
//
// WHY THIS EXISTS
//
// `consume_contact_quota` and `consume_pdf_conversion_quota` bound abuse by a
// bucket that is a salted hash of the caller's IP. They were reachable with the
// `anon` key that ships in the browser bundle, which made them a lockout
// primitive rather than a defence: the salt is a fixed string in the route
// files, so the bucket for any IP is computable by anyone who reads the bundle
// and guesses the construction, and a handful of direct calls then spends
// someone else's allowance.
//
//     POST /rest/v1/rpc/consume_contact_quota {"p_bucket":"<sha256 of victim>"}
//
// Four of those blocked a chosen IP from the contact form for an hour; five
// blocked it from every document converter for ten minutes. Both were verified
// against the live endpoint before this was written, and the burned rows were
// removed afterwards.
//
// This is the exact defect already fixed for `consume_newsletter_quota` and
// `consume_admin_login_quota` (see newsletterDb.js, which records the same
// reasoning at length). Those two were revoked; these two were left behind,
// which is the failure mode worth noting — the vulnerability class was
// understood and the sweep was incomplete, so the fix here is to finish it
// rather than to discover anything new.
//
// The rule, restated from CLAUDE.md: push validation into the database when the
// public role legitimately needs a door, and revoke when it does not. A short
// code is meant to resolve for strangers, so `lookup_short_url` stays open. A
// rate limiter has no legitimate caller but our own server, so it closes.
//
// Note the routes are NOT relying on this alone. Vercel overwrites a
// client-supplied X-Forwarded-For with the real peer address, so an attacker
// could not forge a victim's IP through the public endpoint even before this
// change — the hole was the direct PostgREST call, which bypassed the route and
// its header handling entirely. Closing the RPC is what removes it.
//
// SUPABASE_SERVICE_ROLE_KEY is server-only and must never appear in a
// NEXT_PUBLIC_ variable or reach a client component: it bypasses RLS.

import { createClient } from "@supabase/supabase-js";

/**
 * Whether the limiter's database side is configured.
 *
 * Callers check this so a missing key degrades into a clean "temporarily
 * unavailable" rather than a crash — dev and preview deploys run without it.
 * Every caller fails CLOSED on a false, because a limiter that cannot be
 * reached cannot tell an ordinary user from someone hammering the endpoint.
 */
export function isRateLimitDbConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

/**
 * A service-role client for spending a quota.
 *
 * Built per call rather than at module scope so that importing this file during
 * a static build never requires the key to be present — the same reason
 * newsletterDb() is a function.
 *
 * @returns {import("@supabase/supabase-js").SupabaseClient}
 */
export function rateLimitDb() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false },
  });
}
