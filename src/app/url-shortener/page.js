import UrlShortenerClient from "./UrlShortenerClient";
import JsonLd from "@/components/JsonLd";
import FaqSection from "@/components/FaqSection";
import { jsonLdGraph, toolSoftwareAppJsonLd, breadcrumbJsonLd, faqJsonLd } from "@/lib/jsonLd";
import { colors } from "@/lib/theme";
import { pageMetadata } from "@/lib/pageMetadata";

const title = "Free URL Shortener with Click Tracking";
const description =
  "Shorten long URLs into clean short links for free, with no account required. Track how many clicks each link gets, straight from your browser.";
const appName = "URL Shortener";
const href = "/url-shortener";

export const metadata = pageMetadata({
  title,
  description,
  path: href,
});

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
          toolSoftwareAppJsonLd({ name: appName, description, href, categorySlug: "url-shortener" }),
          breadcrumbJsonLd([
            { name: "Home", href: "/" },
            { name: appName, href },
          ]),
          faqJsonLd(faqs)
        )}
      />
      <h1 style={{ fontSize: "28px", fontWeight: 700, color: colors.text, marginBottom: "12px" }}>
        Free URL Shortener
      </h1>
      <p style={{ fontSize: "15px", color: colors.textMuted, marginBottom: "16px" }}>
        Paste a long URL to get a short link. This free online URL shortener needs no account —
        create links instantly and track how many clicks each one gets. Click counts shown below
        are for links created in this browser session.
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
