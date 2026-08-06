import JpgToPdfClient from "./JpgToPdfClient";
import JsonLd from "@/components/JsonLd";
import FaqSection from "@/components/FaqSection";
import RelatedTools from "@/components/RelatedTools";
import { categories } from "@/lib/tools";
import { jsonLdGraph, toolSoftwareAppJsonLd, breadcrumbJsonLd, faqJsonLd } from "@/lib/jsonLd";
import { colors } from "@/lib/theme";
import { pageMetadata } from "@/lib/pageMetadata";

// "JPG to PDF" is overwhelmingly the phrasing people search, even when their
// files are PNGs — so it leads the title, with the other formats carried in the
// description rather than crowding the headline.
const title = "JPG to PDF — Convert Images to PDF Free";
const description =
  "Convert JPG, PNG, WebP, and AVIF images into a single PDF — free, no sign-up. Reorder pages, set the page size, and keep every file on your device.";
const appName = "JPG to PDF";
const href = "/pdf/jpg-to-pdf";

export const metadata = pageMetadata({
  title,
  description,
  path: href,
});

const faqs = [
  {
    question: "Can I combine several images into one PDF?",
    answer:
      "Yes. Add as many images as you like, drag them into the order you want, and they become one PDF with a page per image.",
  },
  {
    question: "Which image formats can I convert?",
    answer:
      "JPG, PNG, WebP, AVIF, GIF, and BMP. PDF itself can only store JPG and PNG internally, so the other formats are re-encoded in your browser on the way in — the quality is preserved, though the file size may differ.",
  },
  {
    question: "Are my images uploaded to a server?",
    answer:
      "No. This tool builds the PDF entirely in your browser, so your images never leave your device.",
  },
  {
    question: "Why is my photo sideways in other tools but not here?",
    answer:
      "Phone cameras record orientation as a separate EXIF tag rather than rotating the pixels. This tool reads that tag and applies it, so portrait photos stay portrait.",
  },
  {
    question: "Can I change the page size or remove the white borders?",
    answer:
      "Yes. Pick A4 or US Letter with a margin of your choosing, or choose \"Match image\" to make each page exactly the size of its image with no borders at all.",
  },
  {
    question: "How do I convert a PDF back into images?",
    answer:
      "Use the PDF to JPG tool, which renders each page as an image at your choice of resolution.",
  },
];

export default function JpgToPdfPage() {
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
        JPG to PDF
      </h1>
      <p style={{ fontSize: "15px", color: colors.textMuted, marginBottom: "16px" }}>
        Turn images into a single PDF — free, with no sign-up and no watermarks. Everything runs
        in your browser, so your photos are never uploaded anywhere.
      </p>
      <p style={{ fontSize: "14px", color: colors.textMuted, marginBottom: "32px", lineHeight: 1.6 }}>
        Add as many images as you need, drag them into the right order, and choose how each page
        should look. Useful for sending a set of receipts as one document, turning photographed
        pages back into a readable file, or bundling scans for an application form.
      </p>

      <JpgToPdfClient />

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
