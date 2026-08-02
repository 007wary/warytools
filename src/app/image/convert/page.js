import ConvertImageClient from "./ConvertImageClient";
import JsonLd from "@/components/JsonLd";
import FaqSection from "@/components/FaqSection";
import RelatedTools from "@/components/RelatedTools";
import { categories } from "@/lib/tools";
import { jsonLdGraph, toolSoftwareAppJsonLd, breadcrumbJsonLd, faqJsonLd } from "@/lib/jsonLd";
import { colors } from "@/lib/theme";

const title = "Convert Image";
const description = "Convert between PNG, JPG, and WebP, right in your browser.";
const href = "/image/convert";

export const metadata = {
  title,
  description,
  alternates: { canonical: href },
  openGraph: { title: `${title} — WaryTools`, description },
  twitter: { title: `${title} — WaryTools`, description },
};

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
          toolSoftwareAppJsonLd({ name: title, description, href, categorySlug: "image" }),
          breadcrumbJsonLd([
            { name: "Home", href: "/" },
            { name: "Image Tools", href: "/image" },
            { name: title, href },
          ]),
          faqJsonLd(faqs)
        )}
      />
      <h1 style={{ fontSize: "28px", fontWeight: 700, color: colors.text, marginBottom: "12px" }}>
        Convert Image
      </h1>
      <p style={{ fontSize: "15px", color: colors.textMuted, marginBottom: "16px" }}>
        Convert between PNG, JPG, and WebP. Everything happens in your browser — files are never
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
