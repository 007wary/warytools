// The server-side Supabase client for every newsletter write.
//
// WHY THIS EXISTS, AND WHY IT USES THE SERVICE ROLE
//
// The newsletter's authorization is a signed token (newsletterToken.js): an
// unsubscribe link carries an HMAC over purpose.email.expiry, and verifying it
// is what proves the person clicking controls that inbox.
//
// That proof is worth nothing if the operation it guards can be reached
// without it. Every newsletter RPC takes a RAW EMAIL and no token — the token
// check lives in JS, upstream of the call. So while `anon` held EXECUTE on
// them, the anon key that ships in the browser bundle was enough to call them
// directly against PostgREST and skip the check entirely:
//
//     POST /rest/v1/rpc/unsubscribe_newsletter {"p_email":"someone@x.com"}
//
// which unsubscribed any address the caller could name, and the mirror call to
// subscribe_newsletter_directly wrote rows and triggered welcome emails with
// the per-IP quota — enforced only in the route — never consulted. Both were
// verified against the live endpoint before this was written.
//
// This is the same lesson the shortener records ("the database is the security
// boundary, not the API route"), arrived at from the opposite direction. There,
// the answer was to push validation DOWN into a SECURITY DEFINER function,
// because a short code is *meant* to resolve for strangers and the public role
// legitimately needs a door. Here there is no such need: nobody should reach
// these operations with a public key under any circumstances, so the answer is
// to take the door away. `anon` now has no EXECUTE on any of them, and the only
// caller is server-side code that has already verified a token.
//
// Mirroring the HMAC into Postgres and checking the signature in SQL was the
// other option considered — it would keep the check next to the data, the way
// is_shortenable_url does. It was rejected because it means a second copy of
// the signing secret living in the database, and a token secret is exactly the
// kind of thing that should exist in one place. Revoking gives the same
// guarantee with one less copy of the key.
//
// SUPABASE_SERVICE_ROLE_KEY is server-only and must never appear in a
// NEXT_PUBLIC_ variable or reach a client component: it bypasses RLS, so it can
// read the subscriber list that the whole read side is built to keep private.

import { createClient } from "@supabase/supabase-js";

/**
 * Whether the newsletter's database side is configured.
 *
 * Checked by callers so a missing key degrades into a clean "temporarily
 * unavailable" rather than a crash — dev and preview deploys run without it.
 */
export function isNewsletterDbConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

/**
 * A service-role client.
 *
 * Built per call rather than at module scope so that importing this file during
 * a static build never requires the key to be present — the same reason
 * signingSecret() is a function in newsletterToken.js.
 *
 * @returns {import("@supabase/supabase-js").SupabaseClient}
 */
export function newsletterDb() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false },
  });
}
