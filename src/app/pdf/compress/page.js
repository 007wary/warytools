import CompressPdfClient from "./CompressPdfClient";
import JsonLd from "@/components/JsonLd";
import FaqSection from "@/components/FaqSection";
import RelatedTools from "@/components/RelatedTools";
import { categories } from "@/lib/tools";
import { jsonLdGraph, toolSoftwareAppJsonLd, breadcrumbJsonLd, faqJsonLd } from "@/lib/jsonLd";
import { colors } from "@/lib/theme";
import { pageMetadata } from "@/lib/pageMetadata";

const title = "Compress PDF Online Free";
const description =
  "Reduce PDF file size online, free and without sign-up or watermarks. Compression runs in your browser — your file is never uploaded to a server.";
const appName = "Compress PDF";
const href = "/pdf/compress";

export const metadata = pageMetadata({
  title,
  description,
  path: href,
});

const faqs = [
  {
    question: "How much smaller will my PDF get?",
    answer:
      "It depends on the content — PDFs with large embedded images typically shrink the most, while text-only PDFs are already small and compress less.",
  },
  {
    question: "Does compressing reduce quality?",
    answer:
      "Compression mainly re-encodes embedded images at a lower quality/resolution. Text and vector content stay sharp; heavily compressed images may look slightly softer.",
  },
  {
    question: "Is my PDF uploaded to compress it?",
    answer: "No. Compression runs locally in your browser — the file never leaves your device.",
  },
];

export default function CompressPdfPage() {
  const category = categories.find((c) => c.slug === "pdf");

  return (
    <section style={{ maxWidth: "800px", margin: "0 auto", padding: "48px 20px 80px" }}>
      <JsonLd
        data={jsonLdGraph(
          toolSoftwareAppJsonLd({ name: appName, description, href, categorySlug: "pdf" }),
          breadcrumbJsonLd([
            { name: "Home", href: "/" },
            { name: "PDF Tools", href: "/pdf" },
            { name: appName, href },
          ]),
          faqJsonLd(faqs)
        )}
      />
      <h1 style={{ fontSize: "28px", fontWeight: 700, color: colors.text, marginBottom: "12px" }}>
        Compress PDF Online
      </h1>
      <p style={{ fontSize: "15px", color: colors.textMuted, marginBottom: "16px" }}>
        Shrink your PDF&apos;s file size. Everything happens in your browser — files are never
        uploaded anywhere.
      </p>
      <p style={{ fontSize: "14px", color: colors.textMuted, marginBottom: "32px", lineHeight: 1.6 }}>
        Handy for getting a PDF under an email attachment limit or a form upload cap. The tool
        re-encodes embedded images to cut file size while keeping the document readable — no
        account, no watermark, no server round-trip.
      </p>

      <CompressPdfClient />

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
