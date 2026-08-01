import { redirect } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default async function ShortUrlRedirectPage({ params }) {
  const { code } = await params;

  const { data, error } = await supabase
    .from("short_urls")
    .select("id, long_url, clicks")
    .eq("short_code", code)
    .maybeSingle();

  if (error || !data) {
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

  // Best-effort click tracking — don't block the redirect if this fails.
  await supabase
    .from("short_urls")
    .update({ clicks: data.clicks + 1 })
    .eq("id", data.id);

  redirect(data.long_url);
}
