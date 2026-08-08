import ExtractPagesClient from "./ExtractPagesClient";
import JsonLd from "@/components/JsonLd";
import FaqSection from "@/components/FaqSection";
import RelatedTools from "@/components/RelatedTools";
import { categories } from "@/lib/tools";
import { jsonLdGraph, toolSoftwareAppJsonLd, breadcrumbJsonLd, faqJsonLd } from "@/lib/jsonLd";
import { colors } from "@/lib/theme";
import { pageMetadata } from "@/lib/pageMetadata";

const title = "Extract Pages from PDF Online Free";
const description =
  "Pull specific pages out of a PDF online, free and without sign-up. Pick pages visually, save as one PDF or separate files. Runs in your browser — nothing is uploaded.";
const appName = "Extract PDF Pages";
const href = "/pdf/extract-pages";

export const metadata = pageMetadata({
  title,
  description,
  path: href,
});

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
          faqJsonLd(faqs)
        )}
      />
      <h1 style={{ fontSize: "28px", fontWeight: 700, color: colors.text, marginBottom: "12px" }}>
        Extract Pages from PDF
      </h1>
      <p style={{ fontSize: "15px", color: colors.textMuted, marginBottom: "16px" }}>
        Pick the pages you want and save them as a new PDF, or as one file per page. Everything
        happens in your browser — files are never uploaded anywhere.
      </p>
      <p style={{ fontSize: "14px", color: colors.textMuted, marginBottom: "32px", lineHeight: 1.6 }}>
        Useful for pulling one chapter out of a long report, saving the signature page of a
        contract, separating invoices from a scanned batch, or sending someone the three pages
        they asked for instead of the whole document. Select pages visually or type their numbers,
        and typed selections keep the order you enter them in.
      </p>

      <ExtractPagesClient />

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
