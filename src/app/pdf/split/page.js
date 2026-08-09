import SplitPdfClient from "./SplitPdfClient";
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

const title = "Split PDF Online Free";
const description =
  "Split a PDF into separate files or extract a page range online, free and without sign-up. Runs in your browser — your file is never uploaded.";
const appName = "Split PDF";
const href = "/pdf/split";

export const metadata = pageMetadata({
  title,
  description,
  path: href,
});

// Rendered by <HowToSteps /> AND emitted as HowTo structured data. Google
// requires the steps to be visible on the page, so these are one source for
// both rather than schema-only markup describing something nobody can see.
const howToName = "How to split a PDF";
const howToSteps = [
  { name: "Open your PDF", text: "Drag the file onto the drop zone, or click it to browse." },
  { name: "Choose what to extract", text: "Type a page range like 1-3, 7, 12-15, or switch to splitting every page into its own file." },
  { name: "Download the result", text: "Click Extract pages or Split PDF and download the new file, or the zip of files." },
];

const faqs = [
  {
    question: "Can I extract just a few pages from a large PDF?",
    answer:
      "Yes. Enter the page range you want (e.g. pages 3-7) and the tool creates a new PDF containing only those pages.",
  },
  {
    question: "Can I split a PDF into one file per page?",
    answer: "Yes. Choose the split-every-page option to download each page of the document as its own PDF file.",
  },
  {
    question: "Are my files uploaded anywhere to be split?",
    answer:
      "No. Splitting happens entirely in your browser with pdf-lib — the PDF you upload never leaves your device.",
  },
];

export default function SplitPdfPage() {
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
          faqJsonLd(faqs),
          howToJsonLd({ name: howToName, steps: howToSteps, href })
        )}
      />
      <h1 style={{ fontSize: "28px", fontWeight: 700, color: colors.text, marginBottom: "12px" }}>
        Split PDF Online
      </h1>
      <p style={{ fontSize: "15px", color: colors.textMuted, marginBottom: "16px" }}>
        Extract a page range into a new PDF, or split every page into its own file.
        Everything happens in your browser — files are never uploaded anywhere.
      </p>
      <p style={{ fontSize: "14px", color: colors.textMuted, marginBottom: "32px", lineHeight: 1.6 }}>
        Useful for pulling a chapter out of a report, separating a scanned batch into individual
        documents, or trimming a PDF down to just the pages you need — all processed locally in
        the browser with no upload step.
      </p>

      <SplitPdfClient />

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
