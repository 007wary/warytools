import { redirect } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { supabase } from "@/lib/supabaseClient";
import { colors } from "@/lib/theme";

// Must match the alphabet/length UrlShortenerClient generates codes with.
const CODE_PATTERN = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{7}$/;

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
      <p style={{ fontSize: "15px", color: colors.textMuted }}>
        This short link doesn&apos;t exist or may have been removed.
      </p>
    </section>
  );
}

// Only ever redirect to http(s) targets. Re-checked here (not just at
// creation time) so that a row edited directly in the database, or a
// scheme that slips past client-side validation, can never send a visitor
// to a javascript:/data:/file: URL from our domain.
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

  if (!CODE_PATTERN.test(code)) {
    return <NotFound />;
  }

  const { data, error } = await supabase
    .from("short_urls")
    .select("id, long_url")
    .eq("short_code", code)
    .maybeSingle();

  // A lookup failure (Supabase outage, network error) is not the same as
  // "this code was never registered" — report it so an outage shows up in
  // Sentry instead of just looking like a wave of 404s.
  if (error) {
    Sentry.captureException(error, { extra: { code } });
    return <NotFound />;
  }

  if (!data || !isSafeRedirectTarget(data.long_url)) {
    return <NotFound />;
  }

  // Best-effort click tracking — don't block the redirect if this fails,
  // but still report it so a Supabase write outage isn't invisible.
  // Uses an atomic RPC (not select+update) so concurrent redirects on the
  // same link can't race and lose increments.
  const { error: updateError } = await supabase.rpc("increment_short_url_clicks", {
    row_id: data.id,
  });

  if (updateError) {
    Sentry.captureException(updateError, { extra: { code } });
  }

  redirect(data.long_url);
}
