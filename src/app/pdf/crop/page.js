import CropPdfClient from "./CropPdfClient";
import JsonLd from "@/components/JsonLd";
import FaqSection from "@/components/FaqSection";
import RelatedTools from "@/components/RelatedTools";
import { categories } from "@/lib/tools";
import { jsonLdGraph, toolSoftwareAppJsonLd, breadcrumbJsonLd, faqJsonLd } from "@/lib/jsonLd";
import { colors } from "@/lib/theme";
import { pageMetadata } from "@/lib/pageMetadata";

const title = "Crop PDF Online Free — Trim Margins and Borders";
const description =
  "Crop a PDF online for free — drag a region to trim margins, borders, or whitespace. No sign-up, and your file never leaves your browser.";
const appName = "Crop PDF";
const href = "/pdf/crop";

export const metadata = pageMetadata({
  title,
  description,
  path: href,
});

const faqs = [
  {
    question: "Does cropping actually delete the content outside the region?",
    answer:
      "No, and no PDF cropper does. Cropping sets the page's visible boundary, so the trimmed area stops being displayed or printed — but the underlying content is still in the file and someone could widen the boundary again. If you need content genuinely removed, redact it in a dedicated editor before sharing.",
  },
  {
    question: "Can I crop every page at once?",
    answer:
      "Yes, and that's the default. Draw one region and it applies to all pages, which is what you want for a scan with uniform margins. Switch to \"This page only\" to crop a single page and leave the rest untouched.",
  },
  {
    question: "What if my PDF has pages of different sizes?",
    answer:
      "The crop is applied proportionally rather than as a fixed measurement, so each page is trimmed by the same fraction of its own size. Check a few pages with the preview before saving if your document mixes formats.",
  },
  {
    question: "Can I crop to a specific aspect ratio?",
    answer:
      "Yes. Choose Square, 4:3, 3:2, or 16:9 and the region keeps that shape as you drag it. \"Original\" locks to the page's own proportions, which is useful for trimming a border evenly.",
  },
  {
    question: "Can I crop without a mouse?",
    answer:
      "Yes. Focus the crop region and use the arrow keys to move it, or hold Alt with the arrow keys to resize it. Hold Shift for larger steps.",
  },
  {
    question: "Is my file uploaded?",
    answer:
      "No. Cropping happens entirely in your browser, so the PDF never leaves your device.",
  },
];

export default function CropPdfPage() {
  const category = categories.find((c) => c.slug === "pdf");

  return (
    <section style={{ maxWidth: "900px", margin: "0 auto", padding: "48px 20px 80px" }}>
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
        Crop PDF Online
      </h1>
      <p style={{ fontSize: "15px", color: colors.textMuted, marginBottom: "16px" }}>
        Trim margins, borders, and whitespace from a PDF — free, no sign-up. The crop runs in your
        browser, so your file is never uploaded.
      </p>
      <p style={{ fontSize: "14px", color: colors.textMuted, marginBottom: "32px", lineHeight: 1.6 }}>
        Drag a region over the page preview and apply it to one page or all of them. Useful for
        cutting the wide margins off a scanned book, removing a slide deck&apos;s borders before
        printing, or tightening a page so it reads better on a phone.
      </p>

      <CropPdfClient />

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
