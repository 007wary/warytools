import UrlShortenerClient from "./UrlShortenerClient";
import { colors } from "@/lib/theme";

export const metadata = {
  title: "URL Shortener — WaryTools",
  description: "Shorten a long URL and track clicks.",
};

export default function UrlShortenerPage() {
  return (
    <section style={{ maxWidth: "700px", margin: "0 auto", padding: "48px 20px 80px" }}>
      <h1 style={{ fontSize: "28px", fontWeight: 700, color: colors.text, marginBottom: "12px" }}>
        URL Shortener
      </h1>
      <p style={{ fontSize: "15px", color: colors.textMuted, marginBottom: "32px" }}>
        Paste a long URL to get a short link. Click counts shown below are for links created in
        this browser session.
      </p>

      <UrlShortenerClient />
    </section>
  );
}
