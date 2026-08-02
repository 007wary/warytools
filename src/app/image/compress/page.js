import CompressImageClient from "./CompressImageClient";
import JsonLd from "@/components/JsonLd";
import FaqSection from "@/components/FaqSection";
import RelatedTools from "@/components/RelatedTools";
import { categories } from "@/lib/tools";
import { jsonLdGraph, toolSoftwareAppJsonLd, breadcrumbJsonLd, faqJsonLd } from "@/lib/jsonLd";
import { colors } from "@/lib/theme";

const title = "Compress Image";
const description = "Reduce image file size with a quality slider, right in your browser.";
const href = "/image/compress";

export const metadata = {
  title,
  description,
  alternates: { canonical: href },
  openGraph: { title: `${title} — WaryTools`, description },
  twitter: { title: `${title} — WaryTools`, description },
};

const faqs = [
  {
    question: "How much can I shrink an image without losing quality?",
    answer:
      "Most photos hold up well down to around 70-80% quality. Use the slider and preview to find the smallest size that still looks good for your use case.",
  },
  {
    question: "What image formats can I compress?",
    answer: "JPG, PNG, and WebP images are supported for compression.",
  },
  {
    question: "Are my images uploaded to a server to be compressed?",
    answer: "No. Compression happens entirely in your browser using the Canvas API — images never leave your device.",
  },
];

export default function CompressImagePage() {
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
        Compress Image
      </h1>
      <p style={{ fontSize: "15px", color: colors.textMuted, marginBottom: "16px" }}>
        Reduce your image&apos;s file size with an adjustable quality slider. Everything happens
        in your browser — files are never uploaded anywhere.
      </p>
      <p style={{ fontSize: "14px", color: colors.textMuted, marginBottom: "32px", lineHeight: 1.6 }}>
        Great for getting photos under an upload limit or speeding up a page full of images.
        Drag the quality slider and watch the file size update live, so you can balance size
        against sharpness before downloading.
      </p>

      <CompressImageClient />

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
