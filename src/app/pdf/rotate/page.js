import RotatePdfClient from "./RotatePdfClient";
import JsonLd from "@/components/JsonLd";
import FaqSection from "@/components/FaqSection";
import RelatedTools from "@/components/RelatedTools";
import { categories } from "@/lib/tools";
import { jsonLdGraph, toolSoftwareAppJsonLd, breadcrumbJsonLd, faqJsonLd } from "@/lib/jsonLd";
import { colors } from "@/lib/theme";

const title = "Rotate PDF";
const description = "Rotate specific pages or the entire PDF document, right in your browser.";
const href = "/pdf/rotate";

export const metadata = {
  title,
  description,
  alternates: { canonical: href },
  openGraph: { title: `${title} — WaryTools`, description },
  twitter: { title: `${title} — WaryTools`, description },
};

const faqs = [
  {
    question: "Can I rotate just one page instead of the whole document?",
    answer: "Yes. Select individual pages to rotate, or apply a rotation to every page in the document at once.",
  },
  {
    question: "What rotation angles are supported?",
    answer: "Pages rotate in 90° steps — 90°, 180°, or 270° — enough to fix any sideways or upside-down scan.",
  },
  {
    question: "Will rotating affect the PDF's quality?",
    answer: "No. Rotation only changes the page orientation metadata; the underlying content isn't re-rendered or compressed.",
  },
];

export default function RotatePdfPage() {
  const category = categories.find((c) => c.slug === "pdf");

  return (
    <section style={{ maxWidth: "800px", margin: "0 auto", padding: "48px 20px 80px" }}>
      <JsonLd
        data={jsonLdGraph(
          toolSoftwareAppJsonLd({ name: title, description, href, categorySlug: "pdf" }),
          breadcrumbJsonLd([
            { name: "Home", href: "/" },
            { name: "PDF Tools", href: "/pdf" },
            { name: title, href },
          ]),
          faqJsonLd(faqs)
        )}
      />
      <h1 style={{ fontSize: "28px", fontWeight: 700, color: colors.text, marginBottom: "12px" }}>
        Rotate PDF
      </h1>
      <p style={{ fontSize: "15px", color: colors.textMuted, marginBottom: "16px" }}>
        Rotate individual pages or the whole document in 90° steps. Everything happens in your
        browser — files are never uploaded anywhere.
      </p>
      <p style={{ fontSize: "14px", color: colors.textMuted, marginBottom: "32px", lineHeight: 1.6 }}>
        Fixes the common case of a scanned document coming out sideways or upside-down. Pick a
        page (or all of them), rotate to the correct orientation, and download — no scanning
        app or desktop software required.
      </p>

      <RotatePdfClient />

      <FaqSection items={faqs} />
      <RelatedTools
        currentHref={href}
        categorySlug="pdf"
        categoryLabel="PDF tools"
        hubHref="/pdf"
        tools={category.tools}
      />
    </section>
  );
}
