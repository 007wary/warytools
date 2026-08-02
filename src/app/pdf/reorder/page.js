import ReorderPdfClient from "./ReorderPdfClient";
import JsonLd from "@/components/JsonLd";
import FaqSection from "@/components/FaqSection";
import RelatedTools from "@/components/RelatedTools";
import { categories } from "@/lib/tools";
import { jsonLdGraph, toolSoftwareAppJsonLd, breadcrumbJsonLd, faqJsonLd } from "@/lib/jsonLd";
import { colors } from "@/lib/theme";

const title = "Reorder PDF Pages";
const description = "Drag and drop to reorder or delete PDF pages, right in your browser.";
const href = "/pdf/reorder";

export const metadata = {
  title,
  description,
  alternates: { canonical: href },
  openGraph: { title: `${title} — WaryTools`, description },
  twitter: { title: `${title} — WaryTools`, description },
};

const faqs = [
  {
    question: "Can I delete pages while reordering?",
    answer: "Yes. Remove any page you don't need at the same time as dragging the rest into a new order.",
  },
  {
    question: "How do I reorder pages?",
    answer: "Drag a page thumbnail to its new position; the download reflects the order shown on screen.",
  },
  {
    question: "Is there a page limit?",
    answer:
      "No hard limit is enforced, though very large PDFs are bounded by your device's memory since everything is processed in the browser.",
  },
];

export default function ReorderPdfPage() {
  const category = categories.find((c) => c.slug === "pdf");

  return (
    <section style={{ maxWidth: "900px", margin: "0 auto", padding: "48px 20px 80px" }}>
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
        Reorder PDF Pages
      </h1>
      <p style={{ fontSize: "15px", color: colors.textMuted, marginBottom: "16px" }}>
        Drag and drop to reorder pages, or delete the ones you don&apos;t need. Everything
        happens in your browser — files are never uploaded anywhere.
      </p>
      <p style={{ fontSize: "14px", color: colors.textMuted, marginBottom: "32px", lineHeight: 1.6 }}>
        See every page as a thumbnail, drag them into the order you want, and drop any pages
        that don&apos;t belong — useful for tidying up a scanned document or reassembling a
        report before sharing it.
      </p>

      <ReorderPdfClient />

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
