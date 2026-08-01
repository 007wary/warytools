import { redirect } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

// Must match the alphabet/length UrlShortenerClient generates codes with.
const CODE_PATTERN = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{7}$/;

function NotFound() {
  return (
    <section style={{ maxWidth: "600px", margin: "0 auto", padding: "48px 20px 80px" }}>
      <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#111827", marginBottom: "12px" }}>
        Link not found
      </h1>
      <p style={{ fontSize: "15px", color: "#6b7280" }}>
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
    .select("id, long_url, clicks")
    .eq("short_code", code)
    .maybeSingle();

  if (error || !data || !isSafeRedirectTarget(data.long_url)) {
    return <NotFound />;
  }

  // Best-effort click tracking — don't block the redirect if this fails.
  await supabase
    .from("short_urls")
    .update({ clicks: data.clicks + 1 })
    .eq("id", data.id);

  redirect(data.long_url);
}
