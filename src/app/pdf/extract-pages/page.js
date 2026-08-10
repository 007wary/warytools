import ExtractPagesClient from "./ExtractPagesClient";
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

const title = "Extract Pages from PDF Online Free";
// 154 chars — was 166, which Google cut mid-clause at "nothing is".
const description =
  "Pull specific pages out of a PDF online, free and with no sign-up. Pick pages visually and save as one PDF or separate files. Nothing is ever uploaded.";
const appName = "Extract PDF Pages";
const href = "/pdf/extract-pages";

export const metadata = pageMetadata({
  title,
  description,
  path: href,
});

// Rendered by <HowToSteps /> AND emitted as HowTo structured data. Google
// requires the steps to be visible on the page, so these are one source for
// both rather than schema-only markup describing something nobody can see.
const howToName = "How to extract pages from a PDF";
const howToSteps = [
  { name: "Open your PDF", text: "Drag the file onto the drop zone, or click it to browse." },
  { name: "Choose the pages you want", text: "Click the page thumbnails, or type numbers like 1, 4-6. Typing an order such as 5, 1, 9 exports them in that order." },
  { name: "Extract and download", text: "Click Extract pages and download them as one PDF, or as separate files." },
];

const faqs = [
  {
    question: "How do I extract pages from a PDF?",
    answer:
      "Open your PDF, click the pages you want (or type their numbers, e.g. 1-3, 7, 12-15), then download. You get a new PDF containing only those pages.",
  },
  {
    question: "Can I save each extracted page as its own file?",
    answer:
      "Yes. Switch to “Separate file per page” and each page you selected is saved as its own PDF, bundled into a zip. Choose “One PDF” to get them combined into a single document instead.",
  },
  {
    question: "Can I change the order of the extracted pages?",
    answer:
      "Yes — type them in the order you want. Entering 5, 1, 9 gives you a PDF with page 5 first, then 1, then 9. Clicking pages in the grid always keeps them in the document's original order.",
  },
  {
    question: "Can I extract the same page twice?",
    answer:
      "Yes. Typing 1, 1, 3 gives you two copies of page 1 followed by page 3. Clicking a page a second time deselects it instead, since there's no way for a grid to show a duplicate.",
  },
  {
    question: "Are my files uploaded anywhere?",
    answer:
      "No. Pages are extracted entirely in your browser with pdf-lib — the PDF never leaves your device.",
  },
  {
    question: "What's the difference between this and Delete Pages?",
    answer:
      "They're two ends of the same job. Extract Pages keeps only what you select; Delete Pages keeps everything you don't. Pulling three pages out of a hundred is an extraction; dropping three from a hundred is a deletion.",
  },
];

export default function ExtractPagesPage() {
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
        Extract Pages from PDF
      </h1>
      <p style={{ fontSize: "15px", color: colors.textMuted, marginBottom: "16px" }}>
        Pick exactly the pages you want and save them as a new PDF, or as one file per page.
        Everything happens in your browser, so files are never uploaded anywhere.
      </p>
      <p style={{ fontSize: "14px", color: colors.textMuted, marginBottom: "32px", lineHeight: 1.6 }}>
        Perfect for lifting one chapter out of a long report, saving the signature page of a
        contract, separating invoices from a scanned batch, or sending someone the three pages
        they actually asked for instead of the whole document. Click pages in the grid or type
        their numbers — and typing gives you precise control the grid can&apos;t: enter 5, 1, 9 and
        that&apos;s the order you get, or 1, 1 for two copies of the same page. Bookmarks and form
        fields are carried across, and your pages are copied rather than re-rendered, so nothing
        loses a shred of quality.
      </p>

      <ExtractPagesClient />

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
