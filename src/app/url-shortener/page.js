import UrlShortenerClient from "./UrlShortenerClient";
import JsonLd from "@/components/JsonLd";
import FaqSection from "@/components/FaqSection";
import { jsonLdGraph, toolSoftwareAppJsonLd, breadcrumbJsonLd, faqJsonLd } from "@/lib/jsonLd";
import { colors } from "@/lib/theme";

const title = "URL Shortener";
const description = "Shorten a long URL for free and track clicks, no account required.";
const href = "/url-shortener";

export const metadata = {
  title,
  description,
  alternates: { canonical: href },
  openGraph: { title: `${title} — WaryTools`, description },
  twitter: { title: `${title} — WaryTools`, description },
};

const faqs = [
  {
    question: "Do I need an account to shorten a URL?",
    answer: "No. Paste a link and get a short URL immediately — no sign-up required.",
  },
  {
    question: "Do short links expire?",
    answer: "No, short links don't expire on their own and keep working indefinitely.",
  },
  {
    question: "How does click tracking work?",
    answer:
      "Each short link's click count is stored server-side and shown here for links created in this browser session. Clearing your browser data or switching devices won't show links from other sessions.",
  },
];

export default function UrlShortenerPage() {
  return (
    <section style={{ maxWidth: "700px", margin: "0 auto", padding: "48px 20px 80px" }}>
      <JsonLd
        data={jsonLdGraph(
          toolSoftwareAppJsonLd({ name: title, description, href, categorySlug: "url-shortener" }),
          breadcrumbJsonLd([
            { name: "Home", href: "/" },
            { name: title, href },
          ]),
          faqJsonLd(faqs)
        )}
      />
      <h1 style={{ fontSize: "28px", fontWeight: 700, color: colors.text, marginBottom: "12px" }}>
        URL Shortener
      </h1>
      <p style={{ fontSize: "15px", color: colors.textMuted, marginBottom: "16px" }}>
        Paste a long URL to get a short link. Click counts shown below are for links created in
        this browser session.
      </p>
      <p style={{ fontSize: "14px", color: colors.textMuted, marginBottom: "32px", lineHeight: 1.6 }}>
        Turn a long, unwieldy link into a short one that&apos;s easier to share, paste, or print —
        useful for social media posts, printed materials, or anywhere character count matters.
      </p>

      <UrlShortenerClient />

      <FaqSection items={faqs} />
    </section>
  );
}
