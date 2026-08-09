import ReorderPdfClient from "./ReorderPdfClient";
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

// "Rearrange" and "delete pages" are the phrasings people actually search for
// more often than "reorder", so both appear in the description and body copy.
const title = "Reorder & Delete PDF Pages Online Free";
const description =
  "Rearrange, reorder, or delete pages in a PDF by drag and drop — free, no sign-up. Runs in your browser, so your file is never uploaded.";
const appName = "Reorder PDF Pages";
const href = "/pdf/reorder";

export const metadata = pageMetadata({
  title,
  description,
  path: href,
});

// Rendered by <HowToSteps /> AND emitted as HowTo structured data. Google
// requires the steps to be visible on the page, so these are one source for
// both rather than schema-only markup describing something nobody can see.
const howToName = "How to reorder PDF pages";
const howToSteps = [
  { name: "Open your PDF", text: "Drag the file onto the drop zone, or click it to browse." },
  { name: "Rearrange the pages", text: "Drag a page thumbnail to its new position, or grab it with the keyboard using space and the arrow keys." },
  { name: "Save and download", text: "Click Save PDF and download the document in its new page order." },
];

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
        Reorder &amp; Delete PDF Pages Online
      </h1>
      <p style={{ fontSize: "15px", color: colors.textMuted, marginBottom: "16px" }}>
        Drag and drop to rearrange pages, or delete the ones you don&apos;t need. This free
        online tool reorders PDF pages entirely in your browser — files are never uploaded
        anywhere.
      </p>
      <p style={{ fontSize: "14px", color: colors.textMuted, marginBottom: "32px", lineHeight: 1.6 }}>
        See every page as a thumbnail, drag them into the order you want, and drop any pages
        that don&apos;t belong — useful for tidying up a scanned document or reassembling a
        report before sharing it.
      </p>

      <ReorderPdfClient />

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
