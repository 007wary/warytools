import { redirect } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@supabase/supabase-js";
import { colors } from "@/lib/theme";
import { isValidShortCode } from "@/lib/shortCode";

// A redirect stub must never be cached or prerendered — the click count
// depends on the request, and a cached copy would keep serving an old
// target after the row changed.
export const dynamic = "force-dynamic";

// robots.txt already disallows /s/, but that only blocks crawling — an
// externally-linked short link can still be indexed URL-only, and because
// crawling is blocked Google never sees a correction. Without this, such a page
// would also inherit the root layout's `canonical: "/"`, telling Google a
// redirect stub is the homepage. noindex here makes it explicit, and clearing
// the inherited canonical stops the bad signal at the source.
export const metadata = {
  robots: { index: false, follow: false },
  alternates: { canonical: null },
};

function NotFound() {
  return (
    <section style={{ maxWidth: "600px", margin: "0 auto", padding: "48px 20px 80px" }}>
      <h1 style={{ fontSize: "22px", fontWeight: 700, color: colors.text, marginBottom: "12px" }}>
        Link not found
      </h1>
      <p style={{ fontSize: "15px", color: colors.textMuted, marginBottom: "20px" }}>
        This short link doesn&apos;t exist or may have been removed.
      </p>
      <a href="/url-shortener" style={{ fontSize: "15px", color: colors.primary }}>
        Create a short link
      </a>
    </section>
  );
}

/**
 * The anon client for this redirect.
 *
 * Built per request rather than imported from lib/supabaseClient, whose client
 * is constructed at module scope. createClient throws on an empty URL at
 * evaluation time, and `dynamic = "force-dynamic"` does NOT exempt this file
 * from that: Next still evaluates the module while collecting page data, so a
 * module-scope client fails the whole production build when the env vars are
 * absent — with `supabaseUrl is required` and a stack naming neither this file
 * nor the missing variable. Every other server-side client here (newsletterDb,
 * rateLimitDb, the shorten route) is a per-call function for the same reason.
 *
 * Anon, not service-role, deliberately: `lookup_short_url` is SECURITY DEFINER
 * and resolving a code is meant to work for strangers. See lib/newsletterDb.js
 * for why the newsletter routes take the opposite approach.
 */
function shortenerDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } }
  );
}

// Only ever redirect to http(s) targets. Re-checked here (not just at
// creation time) so that a row edited directly in the database, or a
// scheme that slips past validation, can never send a visitor to a
// javascript:/data:/file: URL from our domain.
function isSafeRedirectTarget(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export default async function ShortUrlRedirectPage({ params }) {
  const { code } = await params;

  if (!isValidShortCode(code)) {
    return <NotFound />;
  }

  // Resolves the code and counts the click in one statement. anon has no
  // direct SELECT on short_urls — a table read would return every link on the
  // service, so the only way in is by naming a code you already have. The
  // row's `id` never leaves the database, which is also what stops the click
  // counter from being callable against an arbitrary row.
  // Unconfigured (dev, a preview deploy) degrades to the not-found stub rather
  // than throwing an unhandled error into the request — a visitor following a
  // link should see a page, not a crash.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return <NotFound />;
  }

  const { data: longUrl, error } = await shortenerDb().rpc("lookup_short_url", {
    p_short_code: code,
  });

  // A lookup failure (Supabase outage, network error) is not the same as
  // "this code was never registered" — report it so an outage shows up in
  // Sentry instead of just looking like a wave of 404s.
  if (error) {
    Sentry.captureException(error, { extra: { code } });
    return <NotFound />;
  }

  if (!longUrl || !isSafeRedirectTarget(longUrl)) {
    return <NotFound />;
  }

  redirect(longUrl);
}
