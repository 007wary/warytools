import PdfToJpgClient from "./PdfToJpgClient";
import JsonLd from "@/components/JsonLd";
import FaqSection from "@/components/FaqSection";
import HowToSteps from "@/components/HowToSteps";
import RelatedTools from "@/components/RelatedTools";
import { categories } from "@/lib/tools";
import {
  jsonLdGraph,
  toolSoftwareAppJsonLd,
  breadcrumbJsonLd,
  faqJsonLd,
  howToJsonLd,
} from "@/lib/jsonLd";
import { colors } from "@/lib/theme";
import { pageMetadata } from "@/lib/pageMetadata";

const title = "PDF to JPG — Convert PDF Pages to Images Free";
const description =
  "Convert PDF pages to JPG or PNG images online, free and without sign-up. Choose 72, 150, or 300 DPI. Runs in your browser, so nothing is uploaded.";
const appName = "PDF to JPG";
const href = "/pdf/to-jpg";

export const metadata = pageMetadata({
  title,
  description,
  path: href,
});

// Rendered by <HowToSteps /> AND emitted as HowTo structured data. Google
// requires the steps to be visible on the page, so these are one source for
// both rather than schema-only markup describing something nobody can see.
const howToName = "How to convert a PDF to JPG";
const howToSteps = [
  { name: "Open your PDF", text: "Drag the file onto the drop zone, or click it to browse." },
  { name: "Choose pages and quality", text: "Pick which pages to convert, then choose 72, 150, or 300 DPI and whether you want JPG or PNG." },
  { name: "Convert and download", text: "Click Convert to images and download the picture, or the zip when you converted several pages." },
];

const faqs = [
  {
    question: "What resolution should I choose?",
    answer:
      "150 DPI suits most uses — sharp on screen and good enough to print. Choose 72 DPI for images you'll only view online, or 300 DPI when the result needs to be printed at full quality.",
  },
  {
    question: "Can I convert only some pages?",
    answer:
      "Yes. Enter a range like 1-3, 7, 12-15 to pick exactly the pages you want. A single page downloads as one image; several arrive as a zip.",
  },
  {
    question: "Should I pick JPG or PNG?",
    answer:
      "JPG for pages that are mostly photographs. PNG for text, diagrams, and line art — it keeps glyph edges sharp where JPG leaves visible artefacts, and is often the smaller file for that kind of page too.",
  },
  {
    question: "Is my PDF uploaded anywhere?",
    answer:
      "No. Pages are rendered by your own browser, so the file never leaves your device.",
  },
  {
    question: "Why did my pages render at a lower DPI than I chose?",
    answer:
      "Browsers cap how many pixels a single image can hold. A very large page at 300 DPI can exceed that ceiling, so the tool renders at the highest resolution your device can actually produce and tells you what it used — the alternative would be a silently blank image.",
  },
  {
    question: "Can I extract the original images embedded in the PDF instead?",
    answer:
      "Not with this tool. It renders each page as it appears, including text and vector graphics. Pulling out the embedded photos at their original resolution is a different job, and this tool doesn't attempt it.",
  },
  {
    question: "How do I turn images back into a PDF?",
    answer: "Use the JPG to PDF tool, which combines images into a single document.",
  },
];

export default function PdfToJpgPage() {
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
          faqJsonLd(faqs),
          howToJsonLd({ name: howToName, steps: howToSteps, href })
        )}
      />
      <h1 style={{ fontSize: "28px", fontWeight: 700, color: colors.text, marginBottom: "12px" }}>
        PDF to JPG
      </h1>
      <p style={{ fontSize: "15px", color: colors.textMuted, marginBottom: "16px" }}>
        Convert PDF pages into JPG or PNG images — free, no sign-up, no watermarks. Every page is
        rendered by your own browser, so the file is never uploaded.
      </p>
      <p style={{ fontSize: "14px", color: colors.textMuted, marginBottom: "32px", lineHeight: 1.6 }}>
        Pick the pages you need and the resolution you want, and download them individually or as
        a zip. Handy for pulling a figure out of a paper, posting a page where PDFs aren&apos;t
        supported, or getting a printable image of a certificate.
      </p>

      <PdfToJpgClient />

      <HowToSteps title={howToName} steps={howToSteps} />

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
