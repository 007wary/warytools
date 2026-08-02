import MergePdfClient from "./MergePdfClient";
import JsonLd from "@/components/JsonLd";
import FaqSection from "@/components/FaqSection";
import RelatedTools from "@/components/RelatedTools";
import { categories } from "@/lib/tools";
import { jsonLdGraph, toolSoftwareAppJsonLd, breadcrumbJsonLd, faqJsonLd } from "@/lib/jsonLd";
import { colors } from "@/lib/theme";

const title = "Merge PDF";
const description = "Combine multiple PDFs into one file, right in your browser. No uploads, 100% private.";
const href = "/pdf/merge";

export const metadata = {
  title,
  description,
  alternates: { canonical: href },
  openGraph: { title: `${title} — WaryTools`, description },
  twitter: { title: `${title} — WaryTools`, description },
};

const faqs = [
  {
    question: "Is it safe to merge PDFs with sensitive information here?",
    answer:
      "Yes. Merging happens entirely in your browser using pdf-lib — your files are never uploaded to a server, so nothing leaves your device.",
  },
  {
    question: "Can I choose the order the PDFs are combined in?",
    answer: "Yes. Drag and drop the files into the order you want before merging; the output follows that order.",
  },
  {
    question: "Is there a limit on file size or number of PDFs?",
    answer:
      "There's no hard limit enforced by the tool, but very large files or a large number of PDFs are limited by your device's memory since everything runs client-side.",
  },
];

export default function MergePdfPage() {
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
        Merge PDF
      </h1>
      <p style={{ fontSize: "15px", color: colors.textMuted, marginBottom: "16px" }}>
        Combine multiple PDFs into one file. Reorder them however you like before merging.
        Everything happens in your browser — files are never uploaded anywhere.
      </p>
      <p style={{ fontSize: "14px", color: colors.textMuted, marginBottom: "32px", lineHeight: 1.6 }}>
        Drop in as many PDFs as you need, drag them into the order you want, and download a
        single combined file. Because merging runs locally using pdf-lib, it works offline once
        the page has loaded and nothing about your documents is ever sent anywhere.
      </p>

      <MergePdfClient />

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
