import ConvertImageClient from "./ConvertImageClient";
import JsonLd from "@/components/JsonLd";
import FaqSection from "@/components/FaqSection";
import RelatedTools from "@/components/RelatedTools";
import { categories } from "@/lib/tools";
import { jsonLdGraph, toolSoftwareAppJsonLd, breadcrumbJsonLd, faqJsonLd } from "@/lib/jsonLd";
import { colors } from "@/lib/theme";
import { pageMetadata } from "@/lib/pageMetadata";

// Searches here are overwhelmingly for the specific pair ("png to jpg",
// "webp to png") rather than the generic verb, so the title and description
// spell the formats out instead of saying "convert between formats".
const title = "Convert Image — PNG to JPG, WebP & More";
const description =
  "Convert images between PNG, JPG, and WebP online for free — PNG to JPG, JPG to WebP, WebP to PNG. Runs in your browser, no uploads or sign-up.";
const appName = "Convert Image";
const href = "/image/convert";

export const metadata = pageMetadata({
  title,
  description,
  path: href,
});

const faqs = [
  {
    question: "Which image formats can I convert between?",
    answer: "PNG, JPG, and WebP are all supported as both input and output formats.",
  },
  {
    question: "Why convert a PNG to JPG or WebP?",
    answer:
      "JPG and WebP typically produce much smaller files than PNG for photos, which helps with page load speed and upload limits. PNG is better for images that need transparency or sharp edges like logos.",
  },
  {
    question: "Does converting to JPG lose transparency?",
    answer: "Yes — JPG doesn't support transparency, so any transparent areas are filled with a solid background when converting from PNG or WebP.",
  },
];

export default function ConvertImagePage() {
  const category = categories.find((c) => c.slug === "image");

  return (
    <section style={{ maxWidth: "800px", margin: "0 auto", padding: "48px 20px 80px" }}>
      <JsonLd
        data={jsonLdGraph(
          toolSoftwareAppJsonLd({ name: appName, description, href, categorySlug: "image" }),
          breadcrumbJsonLd([
            { name: "Home", href: "/" },
            { name: "Image Tools", href: "/image" },
            { name: appName, href },
          ]),
          faqJsonLd(faqs)
        )}
      />
      <h1 style={{ fontSize: "28px", fontWeight: 700, color: colors.text, marginBottom: "12px" }}>
        Convert Image Online
      </h1>
      <p style={{ fontSize: "15px", color: colors.textMuted, marginBottom: "16px" }}>
        Convert PNG to JPG, JPG to WebP, WebP to PNG, and every other combination of the three.
        This free online image converter runs entirely in your browser — files are never
        uploaded anywhere.
      </p>
      <p style={{ fontSize: "14px", color: colors.textMuted, marginBottom: "32px", lineHeight: 1.6 }}>
        Pick the format your project actually needs — WebP for smaller web pages, JPG for
        universal compatibility, or PNG when you need transparency — and get the converted file
        instantly, with no software to install.
      </p>

      <ConvertImageClient />

      <FaqSection items={faqs} />
      <RelatedTools
        currentHref={href}
        categorySlug="image"
        categoryLabel="image tools"
        hubHref="/image"
        tools={category.tools}
      />
    </section>
  );
}
